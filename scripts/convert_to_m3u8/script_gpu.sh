#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export ENCODE_MODE=gpu
exec "$SCRIPT_DIR/script_common.sh" "$@"
