#!/usr/bin/env python3
"""Download a clearly open-licensed Internet Archive movie and its subtitles."""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen


VIDEO_SUFFIXES = (".mp4", ".webm", ".mkv", ".ogv")
SUBTITLE_SUFFIXES = (".srt", ".vtt")
OPEN_LICENSE_HOSTS = {"creativecommons.org", "www.creativecommons.org"}
OPEN_LICENSE_PATHS = ("/licenses/by/", "/licenses/by-sa/", "/publicdomain/zero/", "/publicdomain/mark/")


def fetch_metadata(identifier):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}", identifier):
        raise ValueError("Invalid Internet Archive item identifier")
    request = Request(f"https://archive.org/metadata/{quote(identifier)}", headers={"User-Agent": "KinochyArchiveDownloader/1.0"})
    with urlopen(request, timeout=30) as response:
        data = response.read(10_000_001)
    if len(data) > 10_000_000:
        raise ValueError("Metadata exceeds the 10 MB limit")
    result = json.loads(data)
    if not isinstance(result, dict) or not result.get("metadata"):
        raise ValueError("Item not found")
    return result


def licensed_for_reuse(metadata):
    license_url = metadata.get("licenseurl", "")
    if isinstance(license_url, list):
        license_url = license_url[0] if license_url else ""
    parsed = urlparse(license_url)
    return (
        parsed.scheme in {"http", "https"}
        and parsed.hostname in OPEN_LICENSE_HOSTS
        and parsed.path.startswith(OPEN_LICENSE_PATHS)
    )


def safe_files(files):
    for file in files:
        if not isinstance(file, dict):
            continue
        name = file.get("name", "")
        if not isinstance(name, str) or not name or name in {".", ".."}:
            continue
        if "/" in name or "\\" in name or any(ord(char) < 32 for char in name):
            continue
        yield file


def select_files(item, max_video_bytes):
    metadata = item["metadata"]
    if metadata.get("mediatype") != "movies":
        raise ValueError("Item is not marked as a movie")
    if not licensed_for_reuse(metadata):
        raise ValueError("Item has no explicit Creative Commons or public-domain license URL")

    files = list(safe_files(item.get("files", [])))
    videos = [file for file in files if file["name"].lower().endswith(VIDEO_SUFFIXES)]
    videos.sort(key=lambda file: (file.get("source") != "original", not file["name"].lower().endswith(".mp4"), int(file.get("size", 0))))
    for video in videos:
        size = int(video.get("size", 0))
        if not 0 < size <= max_video_bytes:
            continue
        stem = Path(video["name"]).stem.lower()
        subtitles = [
            file for file in files
            if file["name"].lower().endswith(SUBTITLE_SUFFIXES)
            and (Path(file["name"]).stem.lower() == stem or Path(file["name"]).stem.lower().startswith(stem + "."))
        ]
        if subtitles:
            return video, subtitles
    raise ValueError("No video within the size limit has matching .srt/.vtt subtitles")


def search_items(title, max_video_bytes, limit):
    words = re.findall(r"\w+", title, flags=re.UNICODE)
    if not words:
        raise ValueError("Search title must contain letters or numbers")
    phrase = f'title:"{" ".join(words)}"'
    search_words = [word for word in words if len(word) > 2] or words
    loose = " AND ".join(f"title:{word}" for word in search_words)

    def check(identifier):
        try:
            item = fetch_metadata(identifier)
            video, subtitles = select_files(item, max_video_bytes)
            return identifier, item, video, subtitles
        except (ValueError, KeyError, TypeError, HTTPError, URLError, json.JSONDecodeError):
            return None

    seen = set()
    candidates = []
    for title_query in (phrase, loose):
        query = f"mediatype:movies AND licenseurl:* AND format:SubRip AND {title_query}"
        parameters = urlencode({"q": query, "fl[]": "identifier", "rows": 40, "output": "json"})
        request = Request(f"https://archive.org/advancedsearch.php?{parameters}", headers={"User-Agent": "KinochyArchiveDownloader/1.0"})
        with urlopen(request, timeout=30) as response:
            results = json.load(response)
        identifiers = [row.get("identifier") for row in results.get("response", {}).get("docs", [])]
        identifiers = [identifier for identifier in identifiers if identifier and identifier not in seen]
        seen.update(identifiers)
        with ThreadPoolExecutor(max_workers=4) as executor:
            candidates.extend(candidate for candidate in executor.map(check, identifiers) if candidate)
        if len(candidates) >= limit:
            break
    return candidates[:limit]


def download_file(identifier, file, destination):
    url = f"https://archive.org/download/{quote(identifier)}/{quote(file['name'])}"
    part = destination.with_name(destination.name + ".part")
    expected = int(file.get("size", 0))
    if destination.exists() and expected and destination.stat().st_size == expected:
        return
    if destination.exists():
        raise ValueError(f"Existing file has a different size: {destination}")
    if part.exists():
        raise ValueError(f"Incomplete download exists: {part}; remove it before retrying")
    try:
        with urlopen(Request(url, headers={"User-Agent": "KinochyArchiveDownloader/1.0"}), timeout=60) as response:
            with part.open("xb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
        if expected and part.stat().st_size != expected:
            raise ValueError(f"Downloaded size differs from metadata for {file['name']}")
        part.rename(destination)
    except (OSError, ValueError, HTTPError, URLError):
        part.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("identifier", nargs="?", help="Internet Archive item identifier from archive.org/details/IDENTIFIER")
    parser.add_argument("--search", metavar="TITLE", help="Find movies by title with an open license and subtitles")
    parser.add_argument("--pick", type=int, metavar="NUMBER", help="Download a numbered result from --search")
    parser.add_argument("--limit", type=int, default=5, help="Maximum search results to show (default: 5)")
    parser.add_argument("--output", type=Path, default=Path("internet_archive_output"))
    parser.add_argument("--max-video-mb", type=int, default=2048)
    parser.add_argument("--dry-run", action="store_true", help="Show selected files without downloading")
    args = parser.parse_args()
    try:
        if args.max_video_mb <= 0:
            raise ValueError("--max-video-mb must be positive")
        if not 1 <= args.limit <= 20:
            raise ValueError("--limit must be between 1 and 20")
        if bool(args.identifier) == bool(args.search):
            raise ValueError("Provide either an item identifier or --search TITLE")
        if args.pick is not None and not args.search:
            raise ValueError("--pick requires --search")

        if args.search:
            candidates = search_items(args.search, args.max_video_mb * 1024 * 1024, args.limit)
            if not candidates:
                raise ValueError("No matching movies with an open license and subtitle file were found")
            for index, (identifier, item, video, subtitles) in enumerate(candidates, 1):
                title = item["metadata"].get("title", identifier)
                size_mb = int(video["size"]) / 1024 / 1024
                print(f"{index}. {title} [{identifier}] — {size_mb:.1f} MiB, {len(subtitles)} subtitle file(s)")
            if args.pick is None:
                print("Run again with --pick NUMBER to download one of these results.")
                return 0
            if not 1 <= args.pick <= len(candidates):
                raise ValueError(f"--pick must be between 1 and {len(candidates)}")
            identifier, item, video, subtitles = candidates[args.pick - 1]
        else:
            identifier = args.identifier
            item = fetch_metadata(identifier)
            video, subtitles = select_files(item, args.max_video_mb * 1024 * 1024)

        selected = [video, *subtitles]
        print(f"Title: {item['metadata'].get('title', identifier)}")
        print(f"License: {item['metadata']['licenseurl']}")
        for file in selected:
            print(f"File: {file['name']} ({file.get('size', '?')} bytes)")
        if args.dry_run:
            return 0
        destination = args.output / identifier
        destination.mkdir(parents=True, exist_ok=True)
        for file in selected:
            download_file(identifier, file, destination / file["name"])
        summary = {
            "source_url": f"https://archive.org/details/{identifier}",
            "title": item["metadata"].get("title", identifier),
            "license_url": item["metadata"]["licenseurl"],
            "video": video["name"],
            "subtitles": [file["name"] for file in subtitles],
        }
        (destination / "movie.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Saved to {destination}")
        return 0
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, HTTPError, URLError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
