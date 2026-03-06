#!/bin/sh
set -e

# Verify Copilot CLI is available
echo "Checking Copilot CLI installation..."
if ! copilot --help > /dev/null 2>&1; then
  echo "Note: GitHub Copilot CLI is not available (interactive mode disabled)"
fi

echo "Starting Copilot CLI Web..."
exec "$@"
