#!/bin/sh
# Seed COPILOT_CONFIG_DIR from image-bundled sessions on a fresh volume.
#
# When deploying to Azure, COPILOT_CONFIG_DIR=/data/copilot-home (EmptyDir)
# but sessions are baked into the image at /home/node/.copilot.
# This script copies them over once so they are visible on first boot.
#
# Subsequent restarts reuse the already-populated volume (EmptyDir survives
# container restarts within the same replica). A new deploy/replica starts
# with an empty volume and gets the latest bundled sessions from the image.

SEED_DIR="/home/node/.copilot"

if [ -n "$COPILOT_CONFIG_DIR" ] && [ "$COPILOT_CONFIG_DIR" != "$SEED_DIR" ]; then
  TARGET_SESSIONS="$COPILOT_CONFIG_DIR/session-state"
  mkdir -p "$TARGET_SESSIONS"

  # Only seed when the target is empty (fresh volume)
  if [ -z "$(ls -A "$TARGET_SESSIONS" 2>/dev/null)" ] && [ -d "$SEED_DIR/session-state" ]; then
    echo "[STARTUP] Seeding sessions from bundled image data into $TARGET_SESSIONS ..."
    cp -a "$SEED_DIR/session-state/." "$TARGET_SESSIONS/"
    COUNT=$(ls "$TARGET_SESSIONS" | wc -l | tr -d ' ')
    echo "[STARTUP] Seeded $COUNT sessions"
  fi

  # Copy session-store.db (SDK index) if not already present
  if [ ! -f "$COPILOT_CONFIG_DIR/session-store.db" ] && [ -f "$SEED_DIR/session-store.db" ]; then
    cp "$SEED_DIR/session-store.db" "$COPILOT_CONFIG_DIR/session-store.db"
    echo "[STARTUP] Copied session-store.db"
  fi
fi

exec node server.js
