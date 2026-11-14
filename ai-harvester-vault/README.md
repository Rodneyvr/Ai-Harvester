# RedCoda Harvester Vault

**Universal AI Skill & Agent Harvester + Encrypted API Credential Vault**

A modular, embeddable full-stack system for discovering, harvesting, and managing AI agents, skills, and API credentials. Built by [RedCoda](https://github.com/Rodneyvr) — *We Build Cool Stuff. You're Welcome.*

![RedCoda Logo](branding/logo.png)

---

## Architecture

The project is split into independently installable packages so you can incorporate only what you need into another project:

```
ai-harvester-vault/
├── branding/                 # RedCoda brand assets (logo, theme)
├── packages/
│   ├── harvester_core/       # 📦 Embeddable Python library (pip-installable)
│   │   ├── vault.py          # Encrypted credential CRUD
│   │   ├── agent.py          # Agent CRUD + search
│   │   ├── scanner.py        # Prompt injection / malicious code detection
│   │   ├── extractor.py      # LLM-based content extraction
│   │   ├── normalizer.py     # Deduplication + quality scoring + embeddings
│   │   ├── discovery.py      # Multi-source URL discovery
│   │   ├── crawler.py        # Playwright / Crawl4AI crawler
│   │   └── database.py       # SQLite / PostgreSQL session management
│   ├── api/                  # FastAPI backend wrapper (localhost:8000)
│   ├── web/                  # Next.js dashboard (localhost:3000)
│   └── browser-extension/    # Chrome / Firefox / Edge Manifest V3 extension
├── apps/
│   ├── api/                  # Reference FastAPI deployment
│   └── web/                  # Reference Next.js deployment
├── docker-compose.yml        # Optional Docker (Postgres + Redis)
├── setup-android.sh          # Legacy Termux setup
└── README.md
```

---

## Quick Start

### 1. Install the core library (embeddable)

```bash
cd packages/harvester_core
pip install -e .
```

This gives you `import harvester_core` in any Python project:

```python
from harvester_core import VaultService, AgentService, SecurityScanner

vault = VaultService(session)
cred = vault.create(CredentialCreate(
    name="OPENAI_API_KEY",
    provider="openai",
    value="sk-...",
    environment="production",
))
```

### 2. Start the backend API

```bash
cd apps/api
pip install -e .   # or: uv sync
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 3. Start the web dashboard

```bash
cd apps/web
npm install
npm run dev
```

Dashboard: http://localhost:3000

### 4. Install the browser extension

**Chrome / Edge / Brave:**
1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `packages/browser-extension/`

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `packages/browser-extension/manifest.json`

The extension adds:
- **Popup** — quick vault access + credential copy
- **Side panel** — full vault + harvester UI inside the browser
- **Context menu** — right-click any page → "Harvest this page (RedCoda)"
- **Floating harvest button** — appears on pages you visit

---

## Features

| Feature | Description |
|---------|-------------|
| **Universal Harvester** | Discovers AI agents from GitHub, Hugging Face, MCP registry, and web search |
| **LLM Extraction** | Groq / Gemini / Ollama to identify agents, prompts, and tools |
| **Deduplication** | Content hashing + vector similarity (pgvector) merges duplicates |
| **Quality Scoring** | 0–100 automated score based on docs, stars, code completeness |
| **Security Scanner** | Detects prompt injection, `eval`/`exec`, data exfiltration, shell commands |
| **Encrypted Vault** | AES-256-GCM at rest; raw secrets never stored in plaintext |
| **Sandbox** | Isolated code execution with injected vault credentials |
| **Exporters** | Python, TypeScript, Dockerfile, MCP server, `.env` |
| **Health Checker** | Verifies API keys, measures latency, checks free-tier quotas |
| **Browser Extension** | Right-click harvest, side panel vault, popup credential access |

---

## RedCoda Brand

- **Company:** RedCoda
- **Tagline:** *We Build Cool Stuff. You're Welcome.*
- **Sectors:** APPS / AI / AUTOMATION / WEBSITES / DIGITAL MAGIC
- **Primary Color:** `#EF4444` (RedCoda red)
- **Background:** `#0A0A0A` (deep black)

Brand assets are in `branding/`:
- `branding/logo.png` — RedCoda logo
- `branding/theme.json` — Brand colors, typography, sectors

---

## Database Options

| Option | Connection String | Best For |
|--------|-------------------|----------|
| **SQLite** (default) | `sqlite+aiosqlite:///./harvester.db` | Local dev, zero-config |
| **PostgreSQL** | `postgresql+asyncpg://user:pass@host:port/db` | Production, Supabase, Neon |

Set `DATABASE_URL` in `.env` (copy from `.env.example`).

---

## Embedding in Another Project

The `packages/harvester_core/` library is designed to be dropped into any Python project:

```python
# 1. Install
pip install -e /path/to/ai-harvester-vault/packages/harvester_core

# 2. Use
from harvester_core import VaultService, init_db

# 3. Initialize database
import asyncio
asyncio.run(init_db())

# 4. Use vault service
from harvester_core import VaultService, CredentialCreate
vault = VaultService(session)
credential = vault.create(CredentialCreate(
    name="STRIPE_KEY",
    provider="stripe",
    value="sk_test_...",
    environment="production",
))
```

The FastAPI backend (`packages/api/`) and Next.js frontend (`packages/web/`) can also be used standalone or as reference implementations.

---

## Security Model

- **AES-256-GCM** encryption for all credentials at rest
- Master key stored only in environment variables (`MASTER_ENCRYPTION_KEY`)
- Nonce and auth tag stored separately for integrity verification
- Plaintext secrets never logged or returned in list responses
- Click-to-reveal in UI for controlled access

---

## License

MIT — Built by RedCoda