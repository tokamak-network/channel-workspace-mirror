#!/usr/bin/env bash
set -euo pipefail

APP_NAME="channel-workspace-mirror"
APP_USER="${APP_USER:-channelmirror}"
APP_HOME="${APP_HOME:-/var/lib/${APP_NAME}}"
APP_DIR="${APP_DIR:-/opt/${APP_NAME}}"
ENV_FILE="${ENV_FILE:-/etc/${APP_NAME}.env}"
NODE_MAJOR="${NODE_MAJOR:-22}"
APP_BRANCH="${APP_BRANCH:-main}"

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

npm install -g "@tokamak-private-dapps/private-state-cli@latest"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "${script_dir}/update-worker.sh"

echo "Installed ${APP_NAME}-indexer.timer."
echo "Check status with: systemctl status ${APP_NAME}-indexer.timer ${APP_NAME}-indexer.service"
echo "Check logs with: journalctl -u ${APP_NAME}-indexer.service -n 200 --no-pager"
