# AWS Worker Deployment

This directory contains the operational pieces for running the persistent indexer worker on an
Ubuntu EC2 instance.

The Vercel deployment remains the public mirror and observer API. The EC2 worker is only responsible
for running `npm run indexer:run` on a persistent filesystem so the private-state CLI recovery index
and raw RPC history survive between runs.

## Minimum EC2 Shape

Use a small Ubuntu instance with an EBS volume. For AWS free-tier style operation, keep the design to
EC2 plus EBS only:

- instance: `t3.micro` or another free-tier eligible small Linux instance
- disk: gp3 EBS, at least 20 GB; increase it if the CLI workspace grows
- networking: SSH from your IP only
- avoid: load balancers, NAT gateways, RDS, Elastic IPs, or other always-billed resources

## Required Secrets

Create `/etc/channel-workspace-mirror.env` on the EC2 host with:

```bash
DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=...
ADMIN_TOKEN=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
APP_REPO_URL=https://github.com/<owner>/<repo>.git
APP_BRANCH=main
NODE_MAJOR=22
```

The runtime RPC URL and RPC limits are not stored in this file. They are read from Neon through the
admin-config API and used by `npm run indexer:run`.

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are required for mirror upload completion alerts. The
worker sends a Telegram message after every due mirror publish attempt with either the success or
failure result. Telegram delivery failures are logged, but they do not replace the original worker
result.

## Install

Copy or clone this repository on the EC2 host, then run:

```bash
sudo bash ops/aws-worker/bootstrap-ubuntu.sh
```

If `/etc/channel-workspace-mirror.env` does not exist, the script creates a placeholder and stops.
Fill in real values and run the script again.

## Operation

The bootstrap script installs:

- `channel-workspace-mirror-indexer.service`
- `channel-workspace-mirror-indexer.timer`

The repository-managed timer uses the resolved observer cost profile sync interval for
`OnUnitInactiveSec` and also wakes the worker at `07:00 UTC`, which is 15:00 in Asia/Singapore. It
does not use a separate boot-only first-run timer. Each wake attempts CLI recovery and observer sync.
Mirror publishing runs once per Singapore calendar day at the first worker execution at or after
15:00 Asia/Singapore.

Useful commands:

```bash
sudo systemctl status channel-workspace-mirror-indexer.timer
sudo systemctl start channel-workspace-mirror-indexer.service
sudo journalctl -u channel-workspace-mirror-indexer.service -n 200 --no-pager
```

The private-state CLI workspace lives under `/var/lib/channel-workspace-mirror` because the systemd
service runs as the `channelmirror` system user with that home directory.

Each worker run installs `@tokamak-private-dapps/private-state-cli@latest` into the worker user's
private npm prefix before recovery starts.

## Repository-Managed Updates

`ops/aws-worker/update-worker.sh` is the source of truth for updating the EC2 worker after a remote
push. GitHub Actions copies this script to the EC2 host, opens SSH only for the current runner IP,
runs the script with `sudo`, and then removes the temporary SSH rule.

The update script:

- makes `channelmirror` the owner of `/opt/channel-workspace-mirror`
- fetches and resets the checkout to the configured branch
- runs `npm ci`
- resolves the observer sync interval from production runtime config
- installs the repository-managed systemd service and rendered timer units
- reloads systemd and enables the timer

Secrets remain in `/etc/channel-workspace-mirror.env`; the update script does not print or replace
that file.

The GitHub Actions workflow expects these repository variables:

- `AWS_REGION`
- `AWS_ROLE_ARN`
- `EC2_HOST`
- `EC2_PORT`
- `EC2_SECURITY_GROUP_ID`
- `EC2_USER`

It expects this repository secret:

- `EC2_SSH_PRIVATE_KEY`
