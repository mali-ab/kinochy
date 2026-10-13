#!/usr/bin/env python3
"""Export public Puzzle Movies film metadata and preview subtitles."""

import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


HOSTS = {"puzzle-movies.com", "www.puzzle-movies.com"}


class SameSiteRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if urlparse(newurl).hostname not in HOSTS:
            raise ValueError("Refusing to forward authentication outside puzzle-movies.com")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def session_cookie():
    cookie = os.environ.get("PUZZLE_MOVIES_COOKIE")
    if cookie is None:
        env_file = Path(__file__).resolve().parents[2] / ".env"
        if env_file.is_file():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                key, separator, value = line.partition("=")
                if separator and key.strip() == "PUZZLE_MOVIES_COOKIE":
                    cookie = value.strip().strip('"\'')
                    break
    if cookie and ("\r" in cookie or "\n" in cookie):
        raise ValueError("PUZZLE_MOVIES_COOKIE contains an invalid newline")
    return cookie


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.movie = {}
        self._json_ld = False
        self._json_parts = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "meta":
            key = attributes.get("property") or attributes.get("name")
            if key and attributes.get("content"):
                self.meta[key] = attributes["content"]
        if tag == "script" and attributes.get("type") == "application/ld+json":
            self._json_ld = True
            self._json_parts = []

    def handle_data(self, data):
        if self._json_ld:
            self._json_parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._json_ld:
            self._json_ld = False
            try:
                value = json.loads("".join(self._json_parts))
            except json.JSONDecodeError:
                return
            if isinstance(value, dict) and value.get("@type") == "Movie":
                self.movie = value


def extract_subtitles(html):
    match = re.search(r"\bwindow\.SUBTITLES\s*=\s*", html)
    if not match:
        return []
    try:
        subtitles, _ = json.JSONDecoder().raw_decode(html[match.end() :])
    except json.JSONDecodeError:
        return []
    return subtitles if isinstance(subtitles, list) else []


def timestamp(seconds):
    milliseconds = round(float(seconds) * 1000)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def to_srt(subtitles, language):
    blocks = []
    for cue in subtitles:
        try:
            start, end = float(cue["start"]), float(cue["finish"])
            content = cue.get(language, "").strip()
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
        if not content or start < 0 or end <= start:
            continue
        blocks.append(f"{len(blocks) + 1}\n{timestamp(start)} --> {timestamp(end)}\n{content}")
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def export(url, output):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in HOSTS:
        raise ValueError("Use an HTTPS film URL on puzzle-movies.com")
    if not re.fullmatch(r"/films/[a-zA-Z0-9-]+/?", parsed.path):
        raise ValueError("Expected a movie URL like https://puzzle-movies.com/films/total-recall-2012")
    if parsed.username or parsed.password or parsed.port or parsed.query or parsed.fragment:
        raise ValueError("Use a plain movie URL without credentials, port, query, or fragment")

    headers = {"User-Agent": "KinochyMovieExporter/1.0"}
    cookie = session_cookie()
    if cookie:
        headers["Cookie"] = cookie
    request = Request(url, headers=headers)
    with build_opener(SameSiteRedirects()).open(request, timeout=30) as response:
        html = response.read(10_000_001)
    if len(html) > 10_000_000:
        raise ValueError("Movie page exceeds the 10 MB limit")
    page = html.decode("utf-8", errors="replace")
    parser = PageParser()
    parser.feed(page)
    if not parser.movie and not parser.meta.get("og:title"):
        raise ValueError("No public movie metadata found; page may require sign-in")

    subtitles = extract_subtitles(page)
    slug = parsed.path.strip("/").split("/")[-1]
    directory = output / slug
    directory.mkdir(parents=True, exist_ok=True)
    metadata = {
        "source_url": url,
        "title": parser.movie.get("name") or parser.meta.get("og:title", ""),
        "description": parser.meta.get("og:description", ""),
        "poster_url": parser.movie.get("image") or parser.meta.get("og:image", ""),
        "year": parser.movie.get("datePublished"),
        "genres": parser.movie.get("genre", []),
        "preview_subtitle_cues": len(subtitles),
        "video_downloaded": False,
        "note": "Only subtitle cues publicly embedded in the page are exported; these may cover a preview, not the full film.",
    }
    (directory / "movie.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for language in ("en", "ru"):
        srt = to_srt(subtitles, language)
        if srt:
            (directory / f"subtitles.{language}.srt").write_text(srt, encoding="utf-8")
    return directory, metadata


def main():
    argument_parser = argparse.ArgumentParser(description=__doc__)
    argument_parser.add_argument("urls", nargs="+", help="Public Puzzle Movies /films/ URLs")
    argument_parser.add_argument("--output", type=Path, default=Path("puzzle_movies_output"))
    args = argument_parser.parse_args()
    failed = False
    for url in args.urls:
        try:
            directory, metadata = export(url, args.output)
            print(f"{metadata['title']}: {metadata['preview_subtitle_cues']} public cues -> {directory}")
        except (ValueError, HTTPError, URLError, OSError) as error:
            print(f"{url}: {error}", file=sys.stderr)
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
