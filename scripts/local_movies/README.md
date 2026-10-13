# Local movie tools

Create a Kinochy-compatible HLS bundle with FFmpeg:

```bash
python3 scripts/local_movies/convert_to_hls.py "/path/to/movie.mkv"
```

This creates `/path/to/movie_hls/playlist.m3u8` and `.ts` segments. In **Admin → Add movie → HLS bundle**, choose `playlist.m3u8` as the main playlist and select every `.ts` file in the HLS media files picker. Upload optional cover art and `.srt` subtitles separately.

To choose both the output directory and the file names:

```bash
python3 scripts/local_movies/convert_to_hls.py "/path/to/movie.mkv" "/path/to/movie_hls" --name spider-man-2012
```

Everything is saved directly in `/path/to/movie_hls`: `spider-man-2012.m3u8`, `spider-man-2012_00000.ts`, and subsequent segments. You may also pass `--name spider-man-2012.m3u8`.

`--mode auto` (the default) copies existing H.264/AAC streams quickly; other formats are converted to H.264/AAC with a 6-second segment target, CRF 23, and the `veryfast` preset. Stream copy can produce longer segments when the source has sparse keyframes. Use `--mode transcode` for more consistent segment lengths, or `--crf 20 --preset fast` for higher quality at the cost of speed and disk space. The script never overwrites an existing output folder.

The server does not transcode after upload. Keep the generated playlist and all its segments together until the upload completes.
