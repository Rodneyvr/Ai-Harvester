# AI Harvester Vault

Universal AI Skill & Agent Harvester + Secure API Key Vault

A full-stack web application for discovering, harvesting, and managing AI agents, skills, and API credentials — optimized for **100% free-tier deployment** and **Android/Termux** (no Docker required).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                    │
│              Android browser / localhost:3000               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI + Python)               │
│              Termux / localhost:8000                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  SQLite (file)  │  ← Zero-config, default
                    │  harvester.db   │     Works on Android
                    └─────────────────┘
```

---

## 📱 Android / Termux Setup (No Docker)

### Prerequisites
- [Termux](https://termux.com/) installed from F-Droid or GitHub
- Storage access granted: `termux-setup-storage`

### One-Command Setup

```bash
# Clone or copy this project to your phone, then:
cd ai-harvester-vault

# Make the script executable and run it
chmod +x setup-android.sh
bash setup-android.sh
```

This script will:
1. Update Termux packages
2. Install Python, Git, OpenSSL, and build tools
3. Generate a master encryption key (save this!)
4. Create your `.env` file with SQLite database config
5. Install Python dependencies
6. Initialize the SQLite database

### Start the Backend

```bash
cd apps/api
uv run uvicorn main:app --reload --port 8000
```

### Start the Frontend (in a second Termux session)

```bash
cd apps/web
npm install
npm run dev
```

Then open **http://localhost:3000** in your Android browser.

---

## 🔧 Manual Setup (Step-by-Step)

If you prefer to do it manually:

### 1. Install dependencies in Termux

```bash
pkg update && pkg upgrade -y
pkg install -y python git openssl make clang ffmpeg
python -m pip install --upgrade pip uv
```

### 2. Generate master encryption key

```bash
openssl rand -base64 32
```

Copy the output — you'll need it.

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:
- `MASTER_ENCRYPTION_KEY` = the key from step 2
- `DATABASE_URL=sqlite+aiosqlite:///./harvester.db` (already set by default)

### 4. Install Python dependencies

```bash
cd apps/api
uv sync
```

### 5. Initialize the database

```bash
python -c "import asyncio; from core.database import init_db; asyncio.run(init_db())"
```

### 6. Start the backend

```bash
uv run uvicorn main:app --reload --port 8000
```

### 7. Start the frontend (new Termux session)

```bash
cd ../web
npm install
npm run dev
```

Open http://localhost:3000.

---

## 🗄️ Database Options

| Option | Connection String | Best For |
|--------|-------------------|----------|
| **SQLite** (default) | `sqlite+aiosqlite:///./harvester.db` | Android, local dev, zero-config |
| **PostgreSQL** | `postgresql+asyncpg://user:pass@host:port/db` | Termux with PostgreSQL installed |
| **Supabase** | `postgresql+asyncpg://...` | Cloud free tier |
| **Neon** | `postgresql+asyncpg://...` | Cloud free tier |

To switch databases, just change `DATABASE_URL` in `.env` and restart.

---

## 🔑 Master Encryption Key

Your API credentials are encrypted with **AES-256-GCM** using a master key.

- The key is stored in `.env` as `MASTER_ENCRYPTION_KEY`
- Generate it with: `openssl rand -base64 32`
- **Never lose this key** — without it, encrypted credentials cannot be decrypted
- Never commit `.env` to version control

---

## 📦 Project Structure

```
ai-harvester-vault/
├── setup-android.sh              # Android/Termux setup script (no Docker)
├── .env.example                  # Environment template
├── README.md                     # This file
├── docker-compose.yml            # Optional Docker setup (not needed on Android)
├── scripts/
│   └── init-pgvector.sql         # PostgreSQL schema (optional)
├── apps/
│   ├── api/                      # FastAPI backend
│   │   ├── main.py               # Application entry point
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic settings
│   │   │   ├── security.py       # AES-256-GCM encryption
│   │   │   ├── database.py       # SQLAlchemy async (SQLite + Postgres)
│   │   │   └── queue.py          # Redis queue (optional)
│   │   ├── models/               # SQLAlchemy models
│   │   ├── schemas/              # Pydantic schemas
│   │   ├── services/
│   │   │   ├── vault.py          # Encrypted credential CRUD
│   │   │   ├── agent.py          # Agent CRUD + search
│   │   │   ├── harvester/        # Discovery, crawler, extractor, normalizer, scanner
│   │   │   ├── sandbox.py        # Isolated code execution
│   │   │   ├── exporter.py       # Code export (Python/TS/Docker/MCP)
│   │   │   └── health_checker.py # API key health checks
│   │   └── api/                  # FastAPI routers
│   │       ├── vault.py
│   │       ├── agents.py
│   │       ├── harvester.py
│   │       └── sandbox.py
│   │   └── tests/                # Unit tests
│   └── web/                      # Next.js frontend
│       ├── src/
│       │   ├── app/              # App router pages
│       │   ├── components/       # React components
│       │   │   ├── dashboard/    # Shell layout
│   │   │   ├── harvester/        # Harvester view
│   │   │   ├── library/          # Agent library view
│   │   │   ├── vault/            # API vault view
│   │   │   ├── sandbox/          # Sandbox view
│   │   │   ├── command-center/   # Dashboard view
│   │   │   └── ui/               # Primitives (card, button, etc.)
│       │   └── lib/              # API client, utils
│       └── package.json
```

---

## 🧪 Running Tests

```bash
cd apps/api
uv run pytest tests/ -v
```

Tests cover:
- AES-256 encryption/decryption
- Content hashing and deduplication
- Malicious code / prompt injection scanning
- Quality scoring
- Heuristic extraction

---

## 🔒 Security Model

- **AES-256-GCM encryption** for all API credentials
- Master key stored only in `.env` (never in code)
- Nonce and auth tag stored separately for integrity
- Plaintext secrets never logged or returned in list responses
- Click-to-reveal in UI for controlled access
- Zero-trust: database can be compromised without exposing secrets

---

## 🆘 Troubleshooting

### "Module not found: aiosqlite"
```bash
uv pip install aiosqlite
```

### "Port already in use"
```bash
# Find and kill the process
fuser -k 8000/tcp
fuser -k 3000/tcp
```

### Database locked (SQLite)
SQLite allows only one writer at a time. If you see "database is locked", make sure only one backend process is running.

### Redis connection errors
Redis is optional. If you don't have it, background crawl jobs run inline. The API works normally without Redis.

---

## License

MIT