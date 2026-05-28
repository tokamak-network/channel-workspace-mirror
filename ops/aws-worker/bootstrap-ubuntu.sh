#!/usr/bin/env bash
set -euo pipefail

APP_NAME="channel-workspace-mirror"
APP_USER="${APP_USER:-channelmirror}"
APP_HOME="${APP_HOME:-/var/lib/${APP_NAME}}"
APP_DIR="${APP_DIR:-/opt/${APP_NAME}}"
ENV_FILE="${ENV_FILE:-/etc/${APP_NAME}.env}"
NODE_MAJOR="${NODE_MAJOR:-22}"
APP_BRANCH="${APP_BRANCH:-main}"
PRIVATE_STATE_CLI_VERSION="${PRIVATE_STATE_CLI_VERSION:-latest}"
TIMER_INTERVAL="${TIMER_INTERVAL:-5min}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cat > "${ENV_FILE}" <<'EOF'
DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=...
ADMIN_TOKEN=...
APP_REPO_URL=https://github.com/<owner>/<repo>.git
APP_BRANCH=main
NODE_MAJOR=22
PRIVATE_STATE_CLI_VERSION=latest
EOF
  chmod 0600 "${ENV_FILE}"
  echo "Created ${ENV_FILE}. Fill in real values, then run this script again." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

apt-get update
apt-get install -y ca-certificates curl git build-essential

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

npm install -g "@tokamak-private-dapps/private-state-cli@${PRIVATE_STATE_CLI_VERSION}"

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${APP_HOME}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_HOME}" "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_HOME}" "${APP_DIR}"

if [[ -d "${APP_DIR}/.git" ]]; then
  sudo -u "${APP_USER}" git -C "${APP_DIR}" fetch --prune origin
  sudo -u "${APP_USER}" git -C "${APP_DIR}" checkout "${APP_BRANCH}"
  sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only origin "${APP_BRANCH}"
elif [[ -f "${APP_DIR}/package.json" ]]; then
  echo "Using existing source tree at ${APP_DIR}."
else
  if [[ -z "${APP_REPO_URL:-}" || "${APP_REPO_URL}" == "https://github.com/<owner>/<repo>.git" ]]; then
    echo "APP_REPO_URL must be set in ${ENV_FILE}, or clone the repo into ${APP_DIR} before running this script." >&2
    exit 1
  fi
  rm -rf "${APP_DIR:?}/"*
  sudo -u "${APP_USER}" git clone --branch "${APP_BRANCH}" "${APP_REPO_URL}" "${APP_DIR}"
fi

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
sudo -u "${APP_USER}" npm --prefix "${APP_DIR}" install

cat > /etc/systemd/system/${APP_NAME}-indexer.service <<EOF
[Unit]
Description=Channel workspace mirror indexer
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=HOME=${APP_HOME}
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/npm run indexer:run
Nice=5
IOSchedulingClass=best-effort
IOSchedulingPriority=6
TimeoutStartSec=12h
PrivateTmp=true
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=${APP_DIR} ${APP_HOME} /tmp
EOF

cat > /etc/systemd/system/${APP_NAME}-indexer.timer <<EOF
[Unit]
Description=Run channel workspace mirror indexer periodically

[Timer]
OnBootSec=2min
OnUnitInactiveSec=${TIMER_INTERVAL}
Persistent=true
Unit=${APP_NAME}-indexer.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now ${APP_NAME}-indexer.timer

echo "Installed ${APP_NAME}-indexer.timer."
echo "Check status with: systemctl status ${APP_NAME}-indexer.timer ${APP_NAME}-indexer.service"
echo "Check logs with: journalctl -u ${APP_NAME}-indexer.service -n 200 --no-pager"
