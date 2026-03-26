# Remote Access — Smartphone to Local Container

> **TL;DR** — Complete the one-time Tailscale setup below, then run:
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.remote.yml --profile remote up -d --build
> ```

This guide explains how to securely access your locally-running **Copilot Unleashed**
container from a smartphone (or any device) **anywhere in the world** — without opening
firewall ports, without a static IP, and without Azure.

The approach uses **Tailscale** (a WireGuard-based VPN mesh) with its built-in
**HTTPS/TLS serving** capability. Tailscale handles WireGuard encryption, TLS
termination, and Let's Encrypt certificate provisioning automatically.

---

## Architecture

```
Smartphone  ──── WireGuard (Tailscale) ────►  Tailscale sidecar
                                                     │ Tailscale Serve
                                                     │ TLS :443 (auto Let's Encrypt cert)
                                                     │
                                               App container  (:3000, HTTP)
```

**Why this is safe:**

| Layer | Protection |
|-------|------------|
| Transport | WireGuard (ChaCha20-Poly1305) end-to-end encryption |
| TLS | Let's Encrypt certificate provisioned automatically by Tailscale |
| ACLs | Only devices you approve join your tailnet |
| App | Full production security (CSRF, secure cookies, HSTS, CSP) |
| Cookies | `Secure` flag enforced because `NODE_ENV=production` |

---

## One-Time Setup

### 1. Create a Tailscale account and tailnet

1. Go to <https://tailscale.com> and sign up (free for personal use).
2. Install the Tailscale app on your **smartphone**
   ([iOS](https://apps.apple.com/app/tailscale/id1470499037) /
   [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn.android)).
3. Log in on your phone — it will join your tailnet automatically.

### 2. Enable MagicDNS and HTTPS certificates

In the Tailscale admin console (<https://login.tailscale.com/admin/dns>):

- **Enable MagicDNS** — gives every device a stable hostname like
  `copilot-unleashed.your-tailnet.ts.net`
- **Enable HTTPS** — Tailscale provisions a free Let's Encrypt certificate for each device

### 3. Create a Tailscale auth key

Go to <https://login.tailscale.com/admin/settings/keys> and create a new key:

- **Reusable**: ✅ (so the container can re-authenticate after restarts)
- **Ephemeral**: ❌ (we want the device to persist)
- **Expiry**: Set to a long duration or disable expiry for a home server

Copy the key — it starts with `tskey-auth-…`.

### 4. Add initial `.env` entries

Add the following to your `.env` file (copy from `.env.example`):

```dotenv
# Tailscale auth key from step 3
TS_AUTHKEY=tskey-auth-XXXXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Device hostname (becomes <TS_HOSTNAME>.<tailnet>.ts.net after registration)
TS_HOSTNAME=copilot-unleashed

# Leave TS_DOMAIN blank for now — you'll fill it in after the first start (step 6)
TS_DOMAIN=
```

### 5. First start — register the device

Run the remote stack to register the Tailscale device and discover your full hostname:

```bash
docker compose -f docker-compose.yml -f docker-compose.remote.yml \
  --profile remote up -d --build
```

Wait ~15 seconds, then check the Tailscale admin console:
<https://login.tailscale.com/admin/machines>

You will see a new device named `copilot-unleashed` with a full hostname like:
`copilot-unleashed.tail1234.ts.net`

> **Note:** The `tailnet` part (e.g., `tail1234`) is unique to your account.
> The exact FQDN is shown in the **Machines** column of the admin console.

### 6. Set `TS_DOMAIN` and `BASE_URL`

Now that you know the full hostname, update your `.env`:

```dotenv
# Full Tailscale FQDN from the admin machines page
TS_DOMAIN=copilot-unleashed.tail1234.ts.net

# Full HTTPS URL — same as TS_DOMAIN with https:// prefix
BASE_URL=https://copilot-unleashed.tail1234.ts.net
```

### 7. Restart to apply TLS serving

```bash
docker compose -f docker-compose.yml -f docker-compose.remote.yml \
  --profile remote up -d --force-recreate
```

Tailscale will now provision a Let's Encrypt TLS certificate and start serving HTTPS.
After ~30 seconds, your app is reachable at `https://copilot-unleashed.tail1234.ts.net`.

### 8. Generate VAPID keys (for push notifications — optional but recommended)

Push notifications on mobile require HTTPS, which Tailscale now provides. Generate keys:

```bash
node scripts/generate-vapid-keys.mjs
```

Copy the output into your `.env` file:

```dotenv
VAPID_PUBLIC_KEY=Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_SUBJECT=mailto:your@email.com
```

Restart after updating VAPID keys:

```bash
docker compose -f docker-compose.yml -f docker-compose.remote.yml \
  --profile remote up -d --force-recreate
```

---

## Access from Your Smartphone

1. Make sure the **Tailscale app** is running on your phone
2. Open **Safari** (iOS) or **Chrome** (Android) and navigate to
   `https://copilot-unleashed.tail1234.ts.net` (your actual TS_DOMAIN)
3. You should see the Copilot Unleashed login screen with a valid HTTPS padlock

### Install as a PWA

Because you now have HTTPS, the app qualifies as a Progressive Web App:

**iOS (Safari):**
- Tap the **Share** button → **Add to Home Screen**
- The app opens full-screen, just like a native app

**Android (Chrome):**
- Tap the **menu (⋮)** → **Add to Home screen** (or the install banner may appear automatically)

### Enable Push Notifications

After installing as a PWA:
1. Open the app → **Settings** → enable **Push Notifications**
2. Accept the permission prompt
3. You'll receive notifications when the AI responds while the app is in the background

---

## Stop the Remote Stack

```bash
docker compose -f docker-compose.yml -f docker-compose.remote.yml \
  --profile remote down
```

To also remove volumes (including the Tailscale machine registration):

```bash
docker compose -f docker-compose.yml -f docker-compose.remote.yml \
  --profile remote down -v
```

---

## Restrict Access to Specific Devices

By default all devices on your tailnet can reach the app. To lock it down further:

1. Go to <https://login.tailscale.com/admin/acls>
2. Use the ACL editor to allow only specific users or device tags:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["your@email.com"],
      "dst": ["tag:server:443"]
    }
  ]
}
```

You can also enable **user approval** to require manual approval before any new device joins.

---

## Restrict Login to Specific GitHub Users

In addition to Tailscale ACLs, the app has its own application-level allowlist:

```dotenv
# Only these GitHub usernames can log in (comma-separated)
ALLOWED_GITHUB_USERS=yourusername,partnerusername
```

---

## Troubleshooting

### Tailscale container doesn't authenticate

- Check that `TS_AUTHKEY` is set correctly in `.env`
- Verify the key hasn't expired: <https://login.tailscale.com/admin/settings/keys>
- Check logs: `docker compose --profile remote logs tailscale`

### App returns 403 Forbidden (CSRF)

- Verify `BASE_URL` in `.env` matches the exact HTTPS URL of your Tailscale hostname
  (must include `https://` scheme and no trailing slash)
- Ensure `docker-compose.remote.yml` is included in the compose command
- Confirm `NODE_ENV=production` is active (set by `docker-compose.remote.yml`)

### HTTPS cert not provisioning / connection fails

- Ensure **HTTPS certificates** are enabled in the Tailscale admin DNS settings
- `TS_DOMAIN` must be set and must exactly match the device's FQDN (visible in the
  Tailscale admin machines page)
- Check logs: `docker compose --profile remote logs tailscale`
- The entrypoint script (`scripts/tailscale-entrypoint.sh`) will print the domain
  it's configuring — verify it matches your expected FQDN
- Certs typically take up to 60 seconds to provision on first start

### WebSocket connection fails

- Confirm `TRUST_PROXY=1` is active (it's set automatically in `docker-compose.remote.yml`)
- Tailscale Serve passes WebSocket connections through transparently
- Check the app container logs: `docker compose --profile remote logs app`

### Local development still works?

Yes — the default `docker compose up` (without the remote override or `--profile remote`)
starts only the `app` service in development mode (`NODE_ENV=development`) with HTTP on
port 3000. The Tailscale service is **only** started with `--profile remote`.

---

## Security Notes

- **Tailscale auth keys**: Treat `TS_AUTHKEY` like a password. Rotate it periodically.
- **No open firewall ports**: Tailscale Serve listens only on the Tailscale network
  interface (not on a public host port), so it is unreachable from the public internet.
- **TRUST_PROXY=1**: Trusts only the first proxy hop (Tailscale Serve). If you add
  additional proxies, set `XFF_DEPTH` accordingly.
- **Production cookies**: The `Secure` cookie flag is enforced in production mode, so
  session cookies are only sent over HTTPS.
