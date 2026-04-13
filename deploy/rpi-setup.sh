#!/usr/bin/env bash
# ============================================================
#  s&box Terminal Bot — Raspberry Pi 4 deployment script
#  Run: bash ~/sbox-terminal/deploy/rpi-setup.sh
# ============================================================
set -euo pipefail

PROJECT_DIR="$HOME/sbox-terminal"
BOT_DIR="$PROJECT_DIR/apps/bot"

echo "=== 1. System packages ==="
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential libcairo2-dev libjpeg-dev \
  libpango1.0-dev libgif-dev librsvg2-dev pkg-config python3

# node-canvas needs these native libs on ARM

echo "=== 2. Docker (if missing) ==="
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo ">>> Docker installed. Log out & back in, then re-run this script."
  exit 0
fi

echo "=== 3. Node.js 18 + pnpm (if missing) ==="
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
  sudo apt-get install -y nodejs
fi
if ! command -v pnpm &>/dev/null; then
  npm i -g pnpm
fi

echo "=== 4. Start Postgres + Redis ==="
cd "$PROJECT_DIR"
docker compose up -d postgres redis
sleep 3

echo "=== 5. Install dependencies ==="
pnpm install --frozen-lockfile || pnpm install

echo "=== 6. Prisma generate + migrate ==="
pnpm --filter @sbox/db run generate
pnpm --filter @sbox/db run migrate:deploy

echo "=== 7. Install systemd service ==="
sudo tee /etc/systemd/system/sbox-bot.service > /dev/null <<EOF
[Unit]
Description=s&box Terminal Telegram Bot
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$BOT_DIR
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=$(which npx) tsx src/index.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sbox-bot.service
sudo systemctl restart sbox-bot.service

echo ""
echo "=== Done! ==="
echo "Bot status:  sudo systemctl status sbox-bot"
echo "Bot logs:    sudo journalctl -u sbox-bot -f"
echo "Stop bot:    sudo systemctl stop sbox-bot"
echo "Restart bot: sudo systemctl restart sbox-bot"
