#!/usr/bin/env python3
"""Import a downloaded Internet Archive movie through Kinochy's admin API."""

import argparse
import http.cookiejar
import json
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener


def multipart(fields, files):
    boundary = f"kinochy-{uuid.uuid4().hex}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    for name, path in files.items():
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{path.name}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode())
        body.extend(path.read_bytes())
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory created by download.py")
    parser.add_argument("--api-url", default="http://localhost:4000")
    args = parser.parse_args()
    api = args.api_url.rstrip("/")
    parsed = urlparse(api)
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}):
        parser.error("Use HTTPS for remote API URLs")

    try:
        metadata = json.loads((args.directory / "movie.json").read_text(encoding="utf-8"))
        video = args.directory / metadata["video"]
        subtitles = [args.directory / name for name in metadata["subtitles"]]
        english = next((path for path in subtitles if path.name.lower().endswith(".en.srt")), None)
        if english is None:
            english = next((path for path in subtitles if path.suffix.lower() == ".srt"), None)
        if english is None or not video.is_file() or not english.is_file():
            raise ValueError("Downloaded video and English SRT are required")
        if video.parent.resolve() != args.directory.resolve() or english.parent.resolve() != args.directory.resolve():
            raise ValueError("Movie files must be inside the source directory")
        email = "admin@kinochy.local"
        password = "KinochyAdmin@4321!"

        opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        login = Request(
            f"{api}/api/auth/login",
            data=json.dumps({"email": email, "password": password}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with opener.open(login, timeout=30):
            pass

        source = metadata["source_url"]
        with opener.open(f"{api}/api/movies?{urlencode({'search': metadata['title']})}", timeout=30) as response:
            existing = json.load(response)
        if any(source in movie.get("description", "") for movie in existing):
            print("Movie already exists in Kinochy; skipping duplicate import")
            return 0

        fields = {
            "title": metadata["title"],
            "originalTitle": metadata["title"],
            "description": f"Short animated film. Source: {source}. License: {metadata['license_url']}. English subtitles are limited to the cues supplied by the source.",
            "year": "2023",
            "type": "Animation",
            "genres": json.dumps(["Animation"]),
            "country": "",
            "duration": "",
            "difficulty": "easy",
            "accent": "",
            "ageRating": "0+",
        }
        body, content_type = multipart(fields, {"video": video, "subtitleEn": english})
        request = Request(f"{api}/api/admin/movies", data=body, headers={"Content-Type": content_type}, method="POST")
        with opener.open(request, timeout=180) as response:
            movie = json.load(response)
        print(f"Imported: {movie['title']} ({movie['slug']})")
        print(f"Website: {api}/movies/{movie['slug']}")
        return 0
    except (ValueError, KeyError, OSError, HTTPError, URLError, json.JSONDecodeError) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
