# Copilot CLI Mobile 🤖📱

Accedi alla GitHub Copilot CLI (e a qualsiasi terminale) dal browser del tuo smartphone.

## ✨ Funzionalità

- **Terminale completo** nel browser con [xterm.js](https://xtermjs.org/)
- **Ottimizzato per mobile** — dark theme, quick keys, resize automatico
- **Sicuro** — password auth, rate limiting, session tokens con scadenza
- **Zero build step** — `npm install && npm start`
- **Fallback automatico** — usa `node-pty` se disponibile, altrimenti `child_process`

## 🚀 Quick Start

```bash
# Clona il repo
git clone https://github.com/youruser/copilot-cli-mobile.git
cd copilot-cli-mobile

# Configura
cp .env.example .env
# Modifica .env e imposta COPILOT_CLI_PASSWORD

# Installa e avvia
npm install
npm start
```

Apri l'URL mostrato nel terminale sul tuo smartphone (stessa rete WiFi).

## ⚙️ Configurazione

| Variabile | Default | Descrizione |
|---|---|---|
| `COPILOT_CLI_PASSWORD` | *(obbligatoria)* | Password di accesso |
| `PORT` | `3000` | Porta del server |
| `HOST` | `0.0.0.0` | Host binding |
| `SESSION_TTL` | `86400000` | Durata sessione (ms, default 24h) |

## 🔒 Sicurezza

- **Password** — confronto timing-safe con SHA-256
- **Rate limiting** — max 5 tentativi login al minuto per IP
- **Session tokens** — generati con `crypto.randomBytes`, scadenza configurabile
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options
- **Per produzione** — usa HTTPS tramite reverse proxy (nginx/caddy) o tunnel (cloudflared/ngrok)

## 📱 Quick Keys

La barra inferiore offre accesso rapido a:
- `Tab` `^C` `^D` `^Z` `^L` — scorciatoie comuni
- `↑` `↓` `←` `→` — navigazione
- `Esc` `|` `&` `>` `~` `/` — caratteri speciali

## 🏗️ Architettura

```
Browser (smartphone)          Server (PC)
┌─────────────┐              ┌──────────────┐
│  xterm.js   │◄──WebSocket──►│  Express     │
│  + UI       │              │  + node-pty  │
│  + Auth     │              │  + Auth      │
└─────────────┘              └──────────────┘
```

## 📄 License

MIT
