#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_PATH="$DESKTOP_DIR/src-tauri/target/release/bundle/macos/DreamPub.app"
OUTPUT_PATH="$DESKTOP_DIR/src-tauri/target/release/bundle/macos/DreamPub_0.2.1_aarch64.dmg"
STAGING_DIR="$(mktemp -d /private/tmp/dreampub-dmg.XXXXXX)"

if [[ ! -d "$APP_PATH" ]]; then
  echo "DreamPub.app does not exist. Run bundle:app first." >&2
  exit 1
fi

mkdir -p "$STAGING_DIR/DreamPub"
cp -R "$APP_PATH" "$STAGING_DIR/DreamPub/DreamPub.app"
ln -s /Applications "$STAGING_DIR/DreamPub/Applications"
hdiutil create -volname DreamPub -srcfolder "$STAGING_DIR/DreamPub" -ov -format UDZO -fs HFS+ "$OUTPUT_PATH"
echo "Created $OUTPUT_PATH"
