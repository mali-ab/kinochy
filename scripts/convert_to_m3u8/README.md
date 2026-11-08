# MP4 to adaptive HLS

This script converts a video into a master `master.m3u8` playlist with a separate folder and media playlist for every selected quality. It encodes each quality sequentially, which lowers peak memory use compared with running all quality encoders at once.

## Setup

Install FFmpeg, then create your local configuration:

```bash
cp scripts/convert_to_m3u8/.env.example scripts/convert_to_m3u8/.env
```

Edit `.env` and set `MP4_FILE`, `OUTPUT_DIR`, `VIDEO_QUALITIES`, and `SEGMENT_SECONDS`, then run:

```bash
./scripts/convert_to_m3u8/script.sh
```

You can use a configuration file stored elsewhere:

```bash
ENV_FILE=/path/to/video.env ./scripts/convert_to_m3u8/script.sh
```

The output has a master playlist and one directory per quality:

```text
movie_hls/
├── master.m3u8
├── 360p/
│   ├── index.m3u8
│   └── segment_00000.ts
└── 720p/
    ├── index.m3u8
    └── segment_00000.ts
```

The source must have video and audio streams. The script never deletes or replaces files in a non-empty output folder.

The defaults use H.264 CRF 24, the `medium` preset, AAC audio at 96 kb/s, and four-second segments. Four-second segments reduce startup and seeking delay; they do not improve picture quality by themselves. Lower `VIDEO_CRF` (for example, 22) for higher quality and larger files; increase it for smaller files with more quality loss. `VIDEO_THREADS=1` reduces peak memory further at the cost of slower encoding. Multiple qualities are encoded one at a time, so selecting more qualities takes longer but does not multiply the encoder's peak memory usage. Reconvert existing movies to apply segment or quality changes.
