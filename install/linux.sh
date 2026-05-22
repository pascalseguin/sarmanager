#!/usr/bin/env bash
# SAR Manager — Linux / Raspberry Pi Installer
# Tested on: Raspberry Pi OS (Bookworm), Ubuntu 22.04+, Debian 12+
#
# Usage:
#   sudo bash install/linux.sh            # interactive
#   sudo bash install/linux.sh --port 3000 --dir /opt/sarmanager
#
# To uninstall:
#   sudo bash install/linux.sh --uninstall

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
APP_DIR="/opt/sarmanager"
APP_USER="sarmanager"
SERVICE="sarmanager"
PORT=3000
NODE_MIN=20
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNINSTALL=false

# ── Arg parse ─────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --port)    PORT="$2";    shift 2 ;;
    --dir)     APP_DIR="$2"; shift 2 ;;
    --uninstall) UNINSTALL=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Colour helpers ────────────────────────────────────────────────────────────
step()  { echo -e "\n\033[36m  --> $*\033[0m"; }
ok()    { echo -e "      \033[32m$*\033[0m"; }
warn()  { echo -e "      \033[33m$*\033[0m"; }
fail()  { echo -e "      \033[31mERROR: $*\033[0m"; exit 1; }

if [[ $EUID -ne 0 ]]; then
  fail "Run with sudo: sudo bash install/linux.sh"
fi

# ── Uninstall ─────────────────────────────────────────────────────────────────
if $UNINSTALL; then
  step "Uninstalling SAR Manager"
  systemctl stop  "$SERVICE" 2>/dev/null || true
  systemctl disable "$SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/$SERVICE.service"
  systemctl daemon-reload
  ok "systemd service removed"

  if id "$APP_USER" &>/dev/null; then
    userdel "$APP_USER" 2>/dev/null || true
    ok "System user '$APP_USER' removed"
  fi

  [[ -d "$APP_DIR" ]] && rm -rf "$APP_DIR" && ok "Removed $APP_DIR"
  ok "Uninstall complete."
  exit 0
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
step "Checking Node.js"

install_node() {
  step "Installing Node.js $NODE_MIN LTS"

  if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MIN}.x | bash -
    apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    dnf install -y nodejs npm
  else
    fail "Package manager not detected. Install Node.js $NODE_MIN+ manually: https://nodejs.org"
  fi
}

if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
  if [[ $NODE_VER -ge $NODE_MIN ]]; then
    ok "Node.js v$(node --version | tr -d v) already installed"
  else
    warn "Node.js v$(node --version | tr -d v) too old, upgrading..."
    install_node
  fi
else
  install_node
fi

ok "Node.js $(node --version)"

# ── System user ───────────────────────────────────────────────────────────────
step "Creating system user '$APP_USER'"
if id "$APP_USER" &>/dev/null; then
  ok "User '$APP_USER' already exists"
else
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
  ok "User '$APP_USER' created"
fi

# ── Copy files ────────────────────────────────────────────────────────────────
step "Copying files to $APP_DIR"

mkdir -p "$APP_DIR"

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='install' \
  --exclude='.claude' \
  "$REPO_DIR/" "$APP_DIR/"

ok "Files copied"

# ── Install deps + build ──────────────────────────────────────────────────────
step "Installing dependencies"
cd "$APP_DIR"
npm ci --prefer-offline 2>&1 | tail -3
ok "Dependencies installed"

step "Building app (this takes ~1 minute)"
NODE_ENV=production npm run build 2>&1 | tail -5
ok "Build complete"

# ── Permissions ───────────────────────────────────────────────────────────────
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── systemd service ───────────────────────────────────────────────────────────
step "Creating systemd service"

NEXT_BIN="$APP_DIR/node_modules/.bin/next"

cat > "/etc/systemd/system/$SERVICE.service" << EOF
[Unit]
Description=SAR Manager — SEASAR
Documentation=https://github.com/SEASAR/sarmanager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$NEXT_BIN start --port $PORT
Restart=on-failure
RestartSec=5
TimeoutStopSec=10

Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=NEXT_TELEMETRY_DISABLED=1

# Harden the service
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

ok "Service '$SERVICE' enabled and started"

# ── Show access URL ───────────────────────────────────────────────────────────
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[[ -z "$IP" ]] && IP="YOUR-PI-IP"

echo ""
echo -e "  \033[32mInstallation complete!\033[0m"
echo ""
echo "  SAR Manager is running at:"
echo -e "  \033[1;36m  http://$IP:$PORT\033[0m"
echo ""
echo "  Open that URL in any browser on the same network."
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status $SERVICE   # check status"
echo "    sudo systemctl restart $SERVICE  # restart"
echo "    sudo journalctl -u $SERVICE -f   # live logs"
echo ""
