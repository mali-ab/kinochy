# Internet Archive movie downloader

This script downloads one Internet Archive movie file **with matching SRT/VTT subtitles**. It requires the item to be marked as `movies` with a CC0, public-domain mark, CC BY, or CC BY-SA URL. Check the item's actual rights before using or redistributing it; uploader metadata is not a legal guarantee.

Requires Python 3.9+ and no additional packages.

Search by title and inspect qualifying results:

```bash
python3 scripts/internet_archive/download.py --search "Plan 9 From Outer Space"
```

Then download one result by its displayed number:

```bash
python3 scripts/internet_archive/download.py --search "Plan 9 From Outer Space" --pick 1
```

Add `--dry-run` to show the selected files without downloading. Search results depend on Internet Archive's title and file-format indexing; if an item is missing, use its identifier directly.

1. Find an item at `https://archive.org/details/IDENTIFIER` that lists an open license and subtitle files.
2. Preview what would be downloaded:

   ```bash
   python3 scripts/internet_archive/download.py IDENTIFIER --dry-run
   ```

3. Download it:

   ```bash
   python3 scripts/internet_archive/download.py IDENTIFIER --output ./internet_archive_output
   ```

The output directory contains a video, matching subtitle files, and `movie.json`. Original videos are preferred; an Archive-generated derivative is used when necessary. The default video size limit is 2 GiB; adjust it with `--max-video-mb`. Existing complete files are reused, and files with mismatched sizes are never overwritten.

## Import into Kinochy

With the Kinochy API running, import a downloaded item through the admin API:

```bash
python3 scripts/internet_archive/import_to_kinochy.py internet_archive_output/IDENTIFIER
```

The importer uses Kinochy's built-in seeded admin account. It sends credentials only to localhost over HTTP, or to a remote `--api-url` over HTTPS. It skips an item already imported from the same source URL. The current importer expects an English `.srt` file and uploads it with the video; it does not invent a Russian translation.
