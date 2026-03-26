#!/bin/sh
# Tailscale container entrypoint for the remote-access profile.
#
# When TS_DOMAIN is set: generates a tailscale serve config that routes all
# HTTPS traffic on port 443 to the app container at http://app:3000.
# Tailscale automatically provisions a Let's Encrypt TLS certificate for the
# served domain — no manual cert management required.
#
# When TS_DOMAIN is empty: starts Tailscale in plain VPN mode (no HTTPS
# serving). This is used on the first-start bootstrap run so the device can
# register and you can discover its FQDN from the Tailscale admin console.
#
# TS_DOMAIN must be the full Tailscale FQDN for this device, e.g.:
#   copilot-unleashed.tail1234.ts.net
# It is set in your .env file and passed through docker-compose.yml.
# See docs/REMOTE-ACCESS.md for the step-by-step setup guide.

set -e

if [ -z "$TS_DOMAIN" ]; then
  echo "[tailscale-entrypoint] TS_DOMAIN is not set."
  echo "  Starting in bootstrap mode (VPN only, no HTTPS serving)."
  echo "  After this container starts, find the full FQDN at:"
  echo "    https://login.tailscale.com/admin/machines"
  echo "  Then set TS_DOMAIN and BASE_URL in .env and restart."
  exec /usr/local/bin/containerboot
fi

# Generate the tailscale serve config that proxies HTTPS → http://app:3000.
# The hostname key must exactly match the device's Tailscale FQDN (TS_DOMAIN).
printf '{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "%s:443": {
      "Handlers": {
        "/": {
          "Proxy": "http://app:3000"
        }
      }
    }
  }
}\n' "$TS_DOMAIN" > /tmp/serve.json

export TS_SERVE_CONFIG=/tmp/serve.json

echo "[tailscale-entrypoint] Serve config written for domain: $TS_DOMAIN"

# Replace this shell with containerboot (becomes PID 1, handles signals correctly)
exec /usr/local/bin/containerboot