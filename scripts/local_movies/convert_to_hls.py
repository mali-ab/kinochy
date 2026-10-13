#!/usr/bin/env python3
"""Convert a local video to a browser-friendly, flat HLS bundle for Kinochy."""

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def probe(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,codec_type", "-of", "json", str(path)],
        capture_output=True,
        text=True,
        check=True,
    )
    streams = json.loads(result.stdout)["streams"]
    video = next((stream["codec_name"] for stream in streams if stream["codec_type"] == "video"), None)
    audio = next((stream["codec_name"] for stream in streams if stream["codec_type"] == "audio"), None)
    if not video:
        raise ValueError("Input contains no video stream")
    return video, audio


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Source video, for example movie.mkv or movie.mp4")
    parser.add_argument("output", type=Path, nargs="?", help="One new output directory for the playlist and all segments (default: INPUT_hls)")
    parser.add_argument("--name", default="playlist", help="Playlist filename or stem, e.g. spider-man-2012.m3u8")
    parser.add_argument("--mode", choices=("auto", "copy", "transcode"), default="auto")
    parser.add_argument("--segment-seconds", type=int, default=6)
    parser.add_argument("--crf", type=int, default=23, help="H.264 quality; lower is larger/better (default: 23)")
    parser.add_argument("--preset", choices=("ultrafast", "superfast", "veryfast", "faster", "fast", "medium"), default="veryfast")
    parser.add_argument("--audio-bitrate", default="128k")
    args = parser.parse_args()

    source = args.input.resolve()
    output = (args.output or source.with_name(source.stem + "_hls")).resolve()
    name = args.name[:-5] if args.name.lower().endswith(".m3u8") else args.name
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name) or ".." in name:
        parser.error("--name must be a simple filename using letters, numbers, dots, dashes, or underscores")
    playlist_name = f"{name}.m3u8"
    segment_pattern = f"{name}_%05d.ts"
    segment_glob = f"{name}_*.ts"
    if not source.is_file():
        parser.error(f"Input file not found: {source}")
    if output.exists():
        parser.error(f"Output already exists: {output}. Choose a new folder to avoid overwriting media.")
    if args.segment_seconds < 2 or args.segment_seconds > 30:
        parser.error("--segment-seconds must be between 2 and 30")
    if args.crf < 0 or args.crf > 51:
        parser.error("--crf must be between 0 and 51")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        parser.error("ffmpeg and ffprobe must be installed")

    try:
        video_codec, audio_codec = probe(source)
        compatible = video_codec == "h264" and audio_codec in (None, "aac")
        if args.mode == "copy" and not compatible:
            raise ValueError(f"Copy mode needs H.264 video and AAC/no audio; input has {video_codec}/{audio_codec or 'none'}")
        copy_streams = args.mode == "copy" or (args.mode == "auto" and compatible)

        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = Path(tempfile.mkdtemp(prefix=".kinochy-hls-", dir=output.parent))
        try:
            command = ["ffmpeg", "-hide_banner", "-stats", "-i", str(source), "-map", "0:v:0", "-map", "0:a:0?"]
            if copy_streams:
                command += ["-c:v", "copy", "-c:a", "copy"]
            else:
                command += [
                    "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
                    "-pix_fmt", "yuv420p", "-sc_threshold", "0",
                    "-force_key_frames", f"expr:gte(t,n_forced*{args.segment_seconds})",
                    "-c:a", "aac", "-b:a", args.audio_bitrate,
                ]
            command += [
                "-f", "hls", "-hls_time", str(args.segment_seconds), "-hls_list_size", "0",
                "-hls_playlist_type", "vod", "-hls_segment_type", "mpegts",
                "-hls_segment_filename", str(temporary / segment_pattern),
                str(temporary / playlist_name),
            ]
            print(f"Creating HLS bundle ({'stream copy' if copy_streams else 'H.264/AAC transcode'})...", flush=True)
            subprocess.run(command, check=True)
            playlist = temporary / playlist_name
            if not playlist.is_file() or not list(temporary.glob(segment_glob)):
                raise RuntimeError("ffmpeg did not create a playable HLS bundle")
            temporary.rename(output)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)

        print(f"Ready: {output / playlist_name}")
        print(f"All {len(list(output.glob(segment_glob)))} .ts segments are in the same directory: {output}")
        print("Upload that playlist and all its .ts files in Admin → Add movie → HLS bundle.")
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"Conversion failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
