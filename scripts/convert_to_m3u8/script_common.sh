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

FFMPEG_BIN="${FFMPEG_BIN:-ffmpeg}"
FFPROBE_BIN="${FFPROBE_BIN:-ffprobe}"
SEGMENT_SECONDS="${SEGMENT_SECONDS:-4}"
KEYFRAME_SECONDS="${KEYFRAME_SECONDS:-1}"
ENCODER_PRESET="${ENCODER_PRESET:-medium}"
GPU_PRESET="${GPU_PRESET:-p4}"
VIDEO_CRF="${VIDEO_CRF:-24}"
VIDEO_THREADS="${VIDEO_THREADS:-2}"
AUDIO_BITRATE="${AUDIO_BITRATE:-96k}"

command -v "$FFMPEG_BIN" >/dev/null 2>&1 || { echo "ffmpeg is not installed." >&2; exit 1; }
command -v "$FFPROBE_BIN" >/dev/null 2>&1 || { echo "ffprobe is not installed." >&2; exit 1; }
command -v realpath >/dev/null 2>&1 || { echo "realpath is required." >&2; exit 1; }
ENCODE_MODE="${ENCODE_MODE:-cpu}"
case "$ENCODE_MODE" in
  cpu)
    VIDEO_ENCODER=libx264
    VIDEO_ENCODER_ARGS=(-c:v libx264 -preset "$ENCODER_PRESET" -crf "$VIDEO_CRF" -threads:v "$VIDEO_THREADS")
    ;;
  gpu)
    VIDEO_ENCODER="${GPU_ENCODER:-h264_nvenc}"
    [[ "$VIDEO_ENCODER" == h264_nvenc ]] || { echo "GPU_ENCODER currently supports h264_nvenc only." >&2; exit 1; }
    "$FFMPEG_BIN" -hide_banner -h encoder=h264_nvenc >/dev/null 2>&1 || {
      echo "This FFmpeg build does not include h264_nvenc. Install an FFmpeg build with NVIDIA NVENC support." >&2
      exit 1
    }
    VIDEO_ENCODER_ARGS=(-c:v h264_nvenc -preset "$GPU_PRESET" -rc vbr -cq "$VIDEO_CRF" -b:v 0)
    ;;
  *) echo "ENCODE_MODE must be cpu or gpu." >&2; exit 1 ;;
esac
[[ -f "$MP4_FILE" ]] || { echo "Input video not found: $MP4_FILE" >&2; exit 1; }
[[ "$SEGMENT_SECONDS" =~ ^[1-9][0-9]*$ ]] || { echo "SEGMENT_SECONDS must be a positive whole number." >&2; exit 1; }
[[ "$KEYFRAME_SECONDS" =~ ^[1-9][0-9]*$ ]] || { echo "KEYFRAME_SECONDS must be a positive whole number." >&2; exit 1; }
[[ "$VIDEO_CRF" =~ ^([0-9]|[1-4][0-9]|5[01])$ ]] || { echo "VIDEO_CRF must be between 0 and 51." >&2; exit 1; }
[[ "$VIDEO_THREADS" =~ ^[1-9][0-9]*$ ]] || { echo "VIDEO_THREADS must be a positive whole number." >&2; exit 1; }
[[ "$AUDIO_BITRATE" =~ ^[1-9][0-9]*k$ ]] || { echo "AUDIO_BITRATE must look like 96k or 128k." >&2; exit 1; }

OUTPUT_DIR="$(realpath -m -- "$OUTPUT_DIR")"
[[ "$OUTPUT_DIR" != / ]] || { echo "OUTPUT_DIR cannot be /." >&2; exit 1; }
if [[ -d "$OUTPUT_DIR" && -n "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "OUTPUT_DIR is not empty: $OUTPUT_DIR" >&2
  echo "Choose an empty folder; the script will not delete existing files." >&2
  exit 1
fi

# Height, target bitrate, VBV peak rate, and buffer size per quality.
declare -A HEIGHT MAXRATE BUFSIZE
HEIGHT[240p]=240;   MAXRATE[240p]=428k;   BUFSIZE[240p]=600k
HEIGHT[360p]=360;   MAXRATE[360p]=856k;   BUFSIZE[360p]=1200k
HEIGHT[480p]=480;   MAXRATE[480p]=1498k;  BUFSIZE[480p]=2100k
HEIGHT[720p]=720;   MAXRATE[720p]=2996k;  BUFSIZE[720p]=4200k
HEIGHT[1080p]=1080; MAXRATE[1080p]=5350k; BUFSIZE[1080p]=7500k
HEIGHT[1440p]=1440; MAXRATE[1440p]=9630k; BUFSIZE[1440p]=13500k
HEIGHT[2160p]=2160; MAXRATE[2160p]=19260k; BUFSIZE[2160p]=27000k

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

has_audio="$("$FFPROBE_BIN" -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "$MP4_FILE")"
[[ -n "$has_audio" ]] || { echo "The input video must contain an audio stream." >&2; exit 1; }
video_dimensions="$("$FFPROBE_BIN" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$MP4_FILE")"
IFS=x read -r source_width source_height <<< "$video_dimensions"
[[ "${source_width:-}" =~ ^[1-9][0-9]*$ && "${source_height:-}" =~ ^[1-9][0-9]*$ ]] || {
  echo "Could not read the input video's dimensions." >&2
  exit 1
}
(( source_width % 2 == 0 && source_height % 2 == 0 )) || {
  echo "Input dimensions ${source_width}x${source_height} are odd. H.264 4:2:0 needs even dimensions; the script will not resize or crop the source." >&2
  exit 1
}

output_parent="$(dirname -- "$OUTPUT_DIR")"
mkdir -p -- "$output_parent"
WORK_DIR="$(mktemp -d "${OUTPUT_DIR}.tmp.XXXXXX")"
cleanup() {
  if [[ -n "${WORK_DIR:-}" && -d "$WORK_DIR" ]]; then rm -rf -- "$WORK_DIR"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for quality in "${qualities[@]}"; do mkdir -p -- "$WORK_DIR/$quality"; done

master_file="$WORK_DIR/master.m3u8"
{
  printf '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n'
  for quality in "${qualities[@]}"; do
    maxrate_kbps="${MAXRATE[$quality]%k}"
    audio_kbps="${AUDIO_BITRATE%k}"
    bandwidth=$(( (maxrate_kbps + audio_kbps) * 1100 ))
    printf '#EXT-X-STREAM-INF:BANDWIDTH=%d,RESOLUTION=%dx%d\n%s/index.m3u8\n' \
      "$bandwidth" "$source_width" "$source_height" "$quality"
  done
} > "$master_file"

for quality in "${qualities[@]}"; do
  echo "Encoding $quality at original ${source_width}x${source_height} using $VIDEO_ENCODER"
  "$FFMPEG_BIN" \
    -hide_banner -nostdin -y \
    -threads "$VIDEO_THREADS" -filter_threads 1 \
    -i "$MP4_FILE" \
    -map 0:v:0 -map 0:a:0 \
    -vf format=yuv420p \
    "${VIDEO_ENCODER_ARGS[@]}" \
    -maxrate:v "${MAXRATE[$quality]}" -bufsize:v "${BUFSIZE[$quality]}" \
    -c:a aac -b:a "$AUDIO_BITRATE" -ac 2 \
    -sc_threshold 0 \
    -force_key_frames "expr:gte(t,n_forced*$KEYFRAME_SECONDS)" \
    -f hls -hls_time "$SEGMENT_SECONDS" -hls_list_size 0 \
    -hls_playlist_type vod -hls_flags independent_segments+temp_file \
    -hls_segment_filename "$WORK_DIR/$quality/segment_%05d.ts" \
    "$WORK_DIR/$quality/index.m3u8"
done

if [[ -d "$OUTPUT_DIR" ]]; then rmdir -- "$OUTPUT_DIR"; fi
mv -- "$WORK_DIR" "$OUTPUT_DIR"
WORK_DIR=""

printf '\nHLS conversion complete: %s/master.m3u8\n' "$OUTPUT_DIR"
printf 'Encoded qualities: %s\n' "${qualities[*]}"
if [[ "$ENCODE_MODE" == cpu ]]; then
  printf 'Encoded sequentially with CPU threads limited to %s. Original dimensions were preserved.\n' "$VIDEO_THREADS"
else
  printf 'Encoded sequentially with NVIDIA NVENC (%s preset). Original dimensions were preserved.\n' "$GPU_PRESET"
fi
