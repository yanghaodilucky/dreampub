#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_PATH="$DESKTOP_DIR/src-tauri/target/release/bundle/macos/DreamPub.app"
IDENTITY="${DREAMPUB_CODESIGN_IDENTITY:--}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "DreamPub.app does not exist. Run bundle:app first." >&2
  exit 1
fi

codesign --force --deep --sign "$IDENTITY" "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

if [[ "$IDENTITY" == "-" ]]; then
  echo "Applied an ad-hoc signature for local testing. Set DREAMPUB_CODESIGN_IDENTITY to a Developer ID before public distribution."
fi
