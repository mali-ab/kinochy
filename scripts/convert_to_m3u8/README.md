# MP4 to adaptive HLS

This script converts one MP4 into a master `master.m3u8` playlist with a separate folder and media playlist for every selected quality.

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
