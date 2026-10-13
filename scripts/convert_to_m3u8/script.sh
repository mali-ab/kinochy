#!/bin/bash

ffmpeg -i movie.mkv \
  -filter_complex \
  "[0:v]split=3[v1][v2][v3]; \
   [v1]scale=w=1280:h=720[v1out]; \
   [v2]scale=w=854:h=480[v2out]; \
   [v3]scale=w=640:h=360[v3out]" \
  -map "[v1out]" -c:v:0 libx264 -b:v:0 2800k -maxrate:v:0 2996k -bufsize:v:0 4200k \
  -map "[v2out]" -c:v:1 libx264 -b:v:1 1400k -maxrate:v:1 1498k -bufsize:v:1 2100k \
  -map "[v3out]" -c:v:2 libx264 -b:v:2 800k -maxrate:v:2 856k -bufsize:v:2 1200k \
  -map 0:a -c:a:0 aac -b:a:0 128k \
  -map 0:a -c:a:1 aac -b:a:1 96k \
  -map 0:a -c:a:2 aac -b:a:2 64k \
  -f hls \
  -hls_time 6 \
  -hls_playlist_type vod \
  -hls_flags independent_segments \
  -hls_segment_filename "v%v/segment_%04d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  v%v/stream.m3u8