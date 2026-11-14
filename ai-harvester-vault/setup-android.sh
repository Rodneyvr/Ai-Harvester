#!/bin/bash
# ============================================================
# AI Harvester Vault — Android / Termux Setup (No Docker)
# ============================================================
# Run this script in Termux to install dependencies and start the app.
#
#   curl -sL https://raw.githubusercontent.com/.../setup-android.sh | bash
#   OR:  bash setup-android.sh
# ============================================================
set -e

echo "============================================================"
echo "  AI Harvester Vault — Android Setup"
echo "============================================================"

# --- Step 1: Update Termux packages ---
echo "[1/6] Updating Termux packages..."
pkg update -y && pkg upgrade -y

# --- Step 2: Install system dependencies ---
echo "[2/6] Installing system dependencies..."
pkg install -y python git openssl make clang ffmpeg libjpeg-turbo libpng

# Python pip
python -m pip install --upgrade pip uv

# --- Step 3: Generate master encryption key ---
echo "[3/6] Generating master encryption key..."
MASTER_KEY=$(openssl rand -base64 32)
echo "Generated key: $MASTER_KEY"
echo ""
echo "SAVE THIS KEY SOMEWHERE SAFE — you need it to decrypt your vault credentials."
echo ""

# --- Step 4: Create .env file ---
echo "[4/6] Creating .env file..."
cp .env.example .env

# Replace the placeholder master key with the generated one
sed -i "s|^MASTER_ENCRYPTION_KEY=.*|MASTER_ENCRYPTION_KEY=$MASTER_KEY|" .env

echo ".env created with master encryption key."
echo ""

# --- Step 5: Install Python dependencies ---
echo "[5/6] Installing Python dependencies (this may take a few minutes)..."
cd apps/api
uv sync
cd ../..

# --- Step 6: Initialize database ---
echo "[6/6] Initializing database..."
cd apps/api
python -c "import asyncio; from core.database import init_db; asyncio.run(init_db())"
cd ../..

echo ""
echo "============================================================"
echo "  Setup complete!"
echo "============================================================"
echo ""
echo "To start the backend:"
echo "  cd apps/api && uv run uvicorn main:app --reload --port 8000"
echo ""
echo "To start the frontend (in another Termux session):"
echo "  cd apps/web && npm install && npm run dev"
echo ""
echo "Then open http://localhost:3000 in your browser."
echo ""
echo "Your master encryption key: $MASTER_KEY"
echo "Save it — it is stored in .env as MASTER_ENCRYPTION_KEY."
echo "============================================================"
