#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-channel-workspace-mirror}"
APP_USER="${APP_USER:-channelmirror}"
APP_HOME="${APP_HOME:-/var/lib/${APP_NAME}}"
APP_DIR="${APP_DIR:-/opt/${APP_NAME}}"
ENV_FILE="${ENV_FILE:-/etc/${APP_NAME}.env}"
DEFAULT_APP_REPO_URL="https://github.com/tokamak-network/channel-workspace-mirror.git"
APP_REPO_URL="${APP_REPO_URL:-${DEFAULT_APP_REPO_URL}}"
APP_BRANCH="${APP_BRANCH:-main}"
SERVICE_UNIT="${APP_NAME}-indexer.service"
TIMER_UNIT="${APP_NAME}-indexer.timer"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "${ENV_FILE} is required." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${APP_REPO_URL:-}" || "${APP_REPO_URL}" == "https://github.com/<owner>/<repo>.git" ]]; then
  APP_REPO_URL="${DEFAULT_APP_REPO_URL}"
fi
APP_BRANCH="${APP_BRANCH:-main}"

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${APP_HOME}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_HOME}" "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_HOME}" "${APP_DIR}"

systemctl stop "${TIMER_UNIT}" 2>/dev/null || true
systemctl stop "${SERVICE_UNIT}" 2>/dev/null || true

if [[ -d "${APP_DIR}/.git" ]]; then
  sudo -u "${APP_USER}" git -C "${APP_DIR}" fetch --prune origin
  sudo -u "${APP_USER}" git -C "${APP_DIR}" checkout "${APP_BRANCH}"
  sudo -u "${APP_USER}" git -C "${APP_DIR}" reset --hard "origin/${APP_BRANCH}"
else
  if [[ -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    backup_dir="${APP_DIR}.backup-$(date -u +%Y%m%dT%H%M%SZ)"
    mv "${APP_DIR}" "${backup_dir}"
    mkdir -p "${APP_DIR}"
    chown "${APP_USER}:${APP_USER}" "${APP_DIR}"
    echo "Moved existing non-git source tree to ${backup_dir}."
  fi
  sudo -u "${APP_USER}" git clone --branch "${APP_BRANCH}" "${APP_REPO_URL}" "${APP_DIR}"
fi

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
sudo -u "${APP_USER}" npm --prefix "${APP_DIR}" ci

install -o root -g root -m 0644 "${APP_DIR}/ops/aws-worker/${SERVICE_UNIT}" "/etc/systemd/system/${SERVICE_UNIT}"
install -o root -g root -m 0644 "${APP_DIR}/ops/aws-worker/${TIMER_UNIT}" "/etc/systemd/system/${TIMER_UNIT}"

systemctl daemon-reload
systemctl enable --now "${TIMER_UNIT}"

echo "Updated ${APP_NAME} worker to $(sudo -u "${APP_USER}" git -C "${APP_DIR}" rev-parse --short HEAD)."
echo "Timer policy:"
systemctl cat "${TIMER_UNIT}"
