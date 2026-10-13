#!/usr/bin/env python3
"""Import a local movie folder (movie.json, video, cover, subtitles) into Kinochy."""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


def run_curl(arguments, *, input_data=None):
    result = subprocess.run(
        ["curl", "--silent", "--show-error", "--fail-with-body", *arguments],
        input=input_data,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "Request failed")
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--video", type=Path, help="Browser-compatible video to upload instead of movie.mkv")
    parser.add_argument("--api-url", default="http://localhost:4000")
    args = parser.parse_args()
    directory = args.directory.resolve()
    api = args.api_url.rstrip("/")
    if not api.startswith(("http://localhost:", "http://127.0.0.1:", "https://")):
        parser.error("Use HTTPS for a remote API URL")

    try:
        # Some third-party movie.json files contain literal newlines in descriptions.
        metadata = json.loads((directory / "movie.json").read_text(encoding="utf-8"), strict=False)
        title = metadata.get("name") or metadata.get("title")
        if not title:
            raise ValueError("movie.json needs a name or title")
        video = (args.video or directory / "movie.mkv").resolve()
        if not video.is_file():
            raise ValueError(f"Video not found: {video}")

        with urlopen(f"{api}/api/movies?{urlencode({'search': title})}", timeout=30) as response:
            existing = json.load(response)
        if any(movie.get("title") == title for movie in existing):
            print(f"Already imported: {title}")
            return 0

        email = "admin@kinochy.local"
        password = "KinochyAdmin@4321!"

        with tempfile.TemporaryDirectory(prefix="kinochy-import-") as temporary:
            cookie_file = str(Path(temporary) / "cookies")
            run_curl(
                ["--cookie-jar", cookie_file, "--header", "Content-Type: application/json",
                 "--data-binary", "@-", f"{api}/api/auth/login"],
                input_data=json.dumps({"email": email, "password": password}),
            )
            fields = {
                "title": title,
                "originalTitle": metadata.get("realName") or title,
                "description": metadata.get("description", ""),
                "year": str(metadata.get("year", "")),
                "country": metadata.get("country", ""),
                "genres": json.dumps([metadata.get("genres", "Drama")]),
                "type": "Movie" if metadata.get("type") == "film" else metadata.get("type", "Movie"),
                "duration": str(metadata.get("duration", "")),
                "rating": str(metadata.get("rating", "8")),
                "difficulty": "intermediate",
                "ageRating": "12+",
            }
            upload = ["--cookie", cookie_file, "--max-time", "3600"]
            for key, value in fields.items():
                upload.extend(["--form-string", f"{key}={value}"])
            upload.extend(["--form", f"video=@{video}"])
            for field, filename in (("cover", "cover.webp"), ("subtitleEn", "subtitle_en.srt"), ("subtitleRu", "subtitle_ru.srt")):
                path = directory / filename
                if path.is_file():
                    upload.extend(["--form", f"{field}=@{path}"])
            movie = run_curl([*upload, f"{api}/api/admin/movies"])
        print(f"Imported: {movie['title']}")
        print(f"Website: {api}/movies/{movie['slug']}")
        return 0
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
