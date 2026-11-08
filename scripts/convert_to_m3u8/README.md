# MP4 to adaptive HLS

The CPU and GPU scripts convert a video into a master `master.m3u8` playlist with a separate folder and media playlist for every selected bitrate profile. Both preserve the source video's exact width and height: there is no scaling, cropping, padding, or aspect-ratio change. Profiles only change bitrate. Each profile is encoded sequentially, keeping peak memory lower than running all encoders at once.

## Setup

Install FFmpeg, then create your local configuration:

```bash
cp scripts/convert_to_m3u8/.env.example scripts/convert_to_m3u8/.env
```

Edit `.env` and set `MP4_FILE`, `OUTPUT_DIR`, `VIDEO_QUALITIES`, and any desired segment or keyframe settings, then run:

```bash
./scripts/convert_to_m3u8/script_cpu.sh
```

For an NVIDIA GPU with NVENC support in FFmpeg, run:

```bash
./scripts/convert_to_m3u8/script_gpu.sh
```

The existing `script.sh` remains as an alias for the CPU script. Both scripts use the same `.env` file and output layout. The GPU script uses NVIDIA `h264_nvenc`; the installed FFmpeg build, GPU, and driver must support it. FFmpeg documents NVENC as requiring an enabled NVENC build plus runtime GPU/driver support. [FFmpeg NVENC documentation](https://www.ffmpeg.org/ffmpeg-codecs.html#NVENC)

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

The CPU defaults use H.264 CRF 24 with the `medium` preset; the GPU script uses NVENC with the `p4` preset and the same CQ value. Both use AAC audio at 96 kb/s, four-second TS segments, and one-second GOPs (`KEYFRAME_SECONDS`). Every rendition keeps the source dimensions; the selected profile only sets its bitrate cap. Multiple GOPs per segment help the admin HLS player begin decoding before a complete TS segment arrives when progressive loading is supported. More frequent keyframes can slightly increase file size. Lower `VIDEO_CRF` (for example, 22) for higher quality and larger files; increase it for smaller files with more quality loss. `VIDEO_THREADS=1` reduces CPU encoding memory use at the cost of slower encoding. Multiple profiles are encoded one at a time. Reconvert existing movies to apply segment, keyframe, or encoder changes.
