#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPOSITORY_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"
SERVER_DIR="$REPOSITORY_DIR/apps/server"
BINARY_DIR="$DESKTOP_DIR/src-tauri/binaries"

case "$(uname -m)-$(uname -s)" in
  arm64-Darwin) TARGET_TRIPLE="aarch64-apple-darwin" ;;
  x86_64-Darwin) TARGET_TRIPLE="x86_64-apple-darwin" ;;
  *) echo "DreamPub desktop packaging currently supports macOS only." >&2; exit 1 ;;
esac

TEMP_DIR="$(mktemp -d /private/tmp/dreampub-sidecar.XXXXXX)"
mkdir -p "$BINARY_DIR"

(
  cd "$SERVER_DIR"
  UV_CACHE_DIR=/private/tmp/dreampub-uv-cache uv run --with 'pyinstaller>=6,<7' \
    pyinstaller --noconfirm --clean --onefile \
    --name "dreampub-server-$TARGET_TRIPLE" \
    --paths "$SERVER_DIR" \
    --distpath "$TEMP_DIR/dist" \
    --workpath "$TEMP_DIR/work" \
    --specpath "$TEMP_DIR/spec" \
    app/desktop.py
)

install -m 755 "$TEMP_DIR/dist/dreampub-server-$TARGET_TRIPLE" "$BINARY_DIR/dreampub-server-$TARGET_TRIPLE"
echo "Built DreamPub local-service sidecar for $TARGET_TRIPLE."
