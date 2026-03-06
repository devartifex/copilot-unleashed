#!/bin/sh
set -e

# Verify gh copilot is available (built-in since gh 2.x)
if ! gh copilot --help > /dev/null 2>&1; then
  echo "Warning: gh copilot is not available"
fi

exec "$@"
