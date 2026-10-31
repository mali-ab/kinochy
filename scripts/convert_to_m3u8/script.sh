#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Configuration file not found: $ENV_FILE" >&2
  echo "Copy $SCRIPT_DIR/.env.example to $SCRIPT_DIR/.env and edit it." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${MP4_FILE:?MP4_FILE must be set in $ENV_FILE}"
: "${OUTPUT_DIR:?OUTPUT_DIR must be set in $ENV_FILE}"
: "${VIDEO_QUALITIES:?VIDEO_QUALITIES must be set in $ENV_FILE}"
: "${SEGMENT_SECONDS:?SEGMENT_SECONDS must be set in $ENV_FILE}"

FFMPEG_BIN="${FFMPEG_BIN:-ffmpeg}"
FFPROBE_BIN="${FFPROBE_BIN:-ffprobe}"
ENCODER_PRESET="${ENCODER_PRESET:-veryfast}"
AUDIO_BITRATE="${AUDIO_BITRATE:-128k}"

command -v "$FFMPEG_BIN" >/dev/null 2>&1 || { echo "ffmpeg is not installed." >&2; exit 1; }
command -v "$FFPROBE_BIN" >/dev/null 2>&1 || { echo "ffprobe is not installed." >&2; exit 1; }
[[ -f "$MP4_FILE" ]] || { echo "MP4 file not found: $MP4_FILE" >&2; exit 1; }
[[ "$SEGMENT_SECONDS" =~ ^[1-9][0-9]*$ ]] || { echo "SEGMENT_SECONDS must be a positive whole number." >&2; exit 1; }

if [[ -d "$OUTPUT_DIR" && -n "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "OUTPUT_DIR is not empty: $OUTPUT_DIR" >&2
  echo "Choose an empty folder; the script will not delete existing files." >&2
  exit 1
fi

# Each preset defines height, video bitrate, maximum bitrate, and rate-control buffer.
declare -A HEIGHT BITRATE MAXRATE BUFSIZE
HEIGHT[240p]=240;   BITRATE[240p]=400k;   MAXRATE[240p]=428k;   BUFSIZE[240p]=600k
HEIGHT[360p]=360;   BITRATE[360p]=800k;   MAXRATE[360p]=856k;   BUFSIZE[360p]=1200k
HEIGHT[480p]=480;   BITRATE[480p]=1400k;  MAXRATE[480p]=1498k;  BUFSIZE[480p]=2100k
HEIGHT[720p]=720;   BITRATE[720p]=2800k;  MAXRATE[720p]=2996k;  BUFSIZE[720p]=4200k
HEIGHT[1080p]=1080; BITRATE[1080p]=5000k; MAXRATE[1080p]=5350k; BUFSIZE[1080p]=7500k
HEIGHT[1440p]=1440; BITRATE[1440p]=9000k; MAXRATE[1440p]=9630k; BUFSIZE[1440p]=13500k
HEIGHT[2160p]=2160; BITRATE[2160p]=18000k; MAXRATE[2160p]=19260k; BUFSIZE[2160p]=27000k

IFS=',' read -r -a requested_qualities <<< "$VIDEO_QUALITIES"
qualities=()
declare -A seen
for raw_quality in "${requested_qualities[@]}"; do
  quality="${raw_quality//[[:space:]]/}"
  [[ -n "$quality" ]] || continue
  [[ -n "${HEIGHT[$quality]:-}" ]] || {
    echo "Unsupported quality '$quality'. Use: 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p." >&2
    exit 1
  }
  [[ -z "${seen[$quality]:-}" ]] || { echo "Duplicate quality: $quality" >&2; exit 1; }
  seen[$quality]=1
  qualities+=("$quality")
done
(( ${#qualities[@]} > 0 )) || { echo "VIDEO_QUALITIES does not contain a quality." >&2; exit 1; }

has_audio="$($FFPROBE_BIN -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "$MP4_FILE")"
[[ -n "$has_audio" ]] || { echo "The input MP4 must contain an audio stream." >&2; exit 1; }

mkdir -p "$OUTPUT_DIR"
for quality in "${qualities[@]}"; do mkdir -p "$OUTPUT_DIR/$quality"; done

count="${#qualities[@]}"
split_outputs=""
filter_parts=()
for ((i = 0; i < count; i++)); do split_outputs+="[v$i]"; done
filter_parts+=("[0:v:0]split=$count$split_outputs")

command_args=("$FFMPEG_BIN" -hide_banner -y -i "$MP4_FILE")
stream_map=()
for ((i = 0; i < count; i++)); do
  quality="${qualities[$i]}"
  filter_parts+=("[v$i]scale=-2:${HEIGHT[$quality]}:flags=lanczos[v${i}out]")
  command_args+=(
    -map "[v${i}out]" -map 0:a:0
    "-c:v:$i" libx264 "-preset:v:$i" "$ENCODER_PRESET"
    "-b:v:$i" "${BITRATE[$quality]}" "-maxrate:v:$i" "${MAXRATE[$quality]}" "-bufsize:v:$i" "${BUFSIZE[$quality]}"
    "-c:a:$i" aac "-b:a:$i" "$AUDIO_BITRATE" -ac 2
  )
  stream_map+=("v:$i,a:$i,name:$quality")
done

filter_complex="$(IFS=';'; echo "${filter_parts[*]}")"
var_stream_map="${stream_map[*]}"
command_args+=(
  -filter_complex "$filter_complex"
  -pix_fmt yuv420p -sc_threshold 0
  -force_key_frames "expr:gte(t,n_forced*$SEGMENT_SECONDS)"
  -f hls -hls_time "$SEGMENT_SECONDS" -hls_list_size 0
  -hls_playlist_type vod -hls_flags independent_segments
  -master_pl_name master.m3u8 -var_stream_map "$var_stream_map"
  -hls_segment_filename "$OUTPUT_DIR/%v/segment_%05d.ts"
  "$OUTPUT_DIR/%v/index.m3u8"
)

echo "Converting: $MP4_FILE"
echo "Qualities: ${qualities[*]}"
echo "Segment duration: $SEGMENT_SECONDS seconds"
"${command_args[@]}"

echo
echo "HLS conversion complete: $OUTPUT_DIR/master.m3u8"
