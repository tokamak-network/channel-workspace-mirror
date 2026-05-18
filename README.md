# channel-workspace-mirror

Reusable server implementation for channel workspace mirror artifacts.

This repository is DApp-agnostic. A deployment can be scoped per channel, per operator group, or per
DApp, but the code serves the same channel workspace mirror protocol for every deployment.

## Protocol Paths

Public reads use the stable CLI-compatible paths:

```text
GET /.well-known/tokamak-private-state/channel-workspace/<chainId>/<channelId>/manifest.json
GET /.well-known/tokamak-private-state/channel-workspace/<chainId>/<channelId>/checkpoint.zip
GET /.well-known/tokamak-private-state/channel-workspace/<chainId>/<channelId>/deltas/<from>-<to>.json
```

The route handlers look up the latest publish row in Neon and redirect to public Vercel Blob URLs.
Large artifacts are never proxied through Vercel Functions. Uploads also record the exact public
paths produced by the CLI, so deployments with a registered base path or a direct `.json` manifest
URL keep resolving without manual path rewriting.

## Environment

Required for production publish and reads:

```text
BLOB_READ_WRITE_TOKEN=...
DATABASE_URL=...
```

Required for the admin health endpoint:

```text
ADMIN_TOKEN=...
```

`ADMIN_TOKEN` protects all operator-only endpoints for both mirror and observer operations. Runtime
indexer settings such as RPC URL and sync intervals are stored in Neon, not in RPC environment
variables.

## Setup

Install dependencies and apply the schema:

```bash
npm install
npm run migrate
```

The migration creates `mirror_publish_history`, which is required for latest-checkpoint enforcement
and stable route-to-Blob mapping.

## Publishing

Generate mirror files with the private-state CLI:

```bash
private-state-cli channel publish-workspace-mirror \
  --channel-name <CHANNEL> \
  --network mainnet \
  --account <LEADER_ACCOUNT> \
  --output ./mirror-public
```

Upload that output directory from an operator environment that has `BLOB_READ_WRITE_TOKEN` and
`DATABASE_URL`:

```bash
npm run upload:local -- ./mirror-public
```

The upload command:

- locates exactly one `manifest.json` under the provided directory
- validates protocol version 2, required fields, relative bundle URLs, referenced files, SHA-256,
  and `sizeBytes`
- rejects checkpoints that are not newer than the latest DB record for the same `chainId/channelId`
- uploads each artifact to immutable Blob keys
- records the publish in Neon

The server follows the CLI output layout. If the CLI changes the protocol or output shape, this
server should change to match the CLI.

## Cleanup

The first cleanup command is intentionally dry-run only:

```bash
npm run cleanup:dry-run
```

By default it reports publish rows older than 30 days that are outside the latest two checkpoints
for each channel. It does not delete Blob objects or DB rows.

## Public Channel Observer

The same deployment can also expose a public observer for indexed L1 channel activity. The observer
is a read layer over public data; it does not deanonymize private note transfers.

```text
GET /observer/the-great-first-channel
GET /api/observer/channels/the-great-first-channel
GET /api/observer/channels/the-great-first-channel/events
```

The observer uses separate tables from the mirror artifact history:

- `observer_channels`
- `observer_sync_state`
- `observer_events`

Run the sync job from an operator environment with DB credentials after configuring the runtime RPC
URL through the admin API:

```bash
npm run observer:sync
```

The observer does not use `OBSERVER_RPC_URL` or `RPC_URL` fallbacks. The sync job reads RPC settings
from `indexer_runtime_config`. It imports CLI `channel recover-workspace --output-raw` call history
when a raw history directory is provided and then performs targeted event scans only for checklist
events that `channel recover-workspace` does not query.

The integrated worker command is:

```bash
npm run indexer:run
```

Run this command from a persistent worker host, not from Vercel Functions. The Vercel deployment
serves the public mirror and observer APIs, while the worker host keeps the private-state CLI
workspace, recovery index, and raw RPC history on durable local disk.

It performs the operator flow in this order:

- `private-state-cli install --read-only`
- `private-state-cli set rpc` from the DB runtime config
- `private-state-cli channel recover-workspace --source rpc --output-raw`
- observer raw-history import for state-recovery events
- targeted observer RPC scans for bridge, participant, note-delivery, verifier, admin, and upgrade
  events
- optional `private-state-cli channel publish-workspace-mirror` and mirror upload when mirror
  publishing is due

The first worker run on a persistent host performs `recover-workspace --from-genesis --output-raw`
when the local CLI workspace has no recovered channel snapshot yet. Later runs use that host's CLI
recovery index and append only new raw RPC history.

Observer RPC calls use only the RPC scan parameters imported from the private-state CLI
`rpc-config.env`. `LOG_REQUESTS_PER_SECOND` is applied to observer `eth_blockNumber`,
`eth_getLogs`, and `eth_getBlockByNumber` calls, and every observer `eth_getLogs` request scans
exactly one `RPC_BLOCK_RANGE_CAP` block window except for the final shorter tail range. The observer
does not keep a separate confirmation-depth setting. If the CLI detects that incremental recovery is
not trustworthy, the worker retries recovery from genesis and resets accumulated observer scan state.

## Persistent Worker

The repository includes an Ubuntu/systemd deployment helper for an EC2 worker:

```text
ops/aws-worker/
```

The worker uses the same Neon database and Vercel Blob token as the Vercel deployment. Runtime RPC
configuration is still managed through `/api/admin/indexer-config`; the EC2 host only needs
`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, and `ADMIN_TOKEN` in `/etc/channel-workspace-mirror.env`.

The systemd timer runs frequently, but `npm run indexer:run` checks the DB runtime intervals before
performing any heavy recovery, observer sync, or mirror publish work.

## Health

```text
GET /api/health
GET /api/admin/health
GET /api/admin/indexer-config
PUT /api/admin/indexer-config
GET /api/admin/indexer-state
```

`/api/health` is public liveness. `/api/admin/health` requires
`Authorization: Bearer <ADMIN_TOKEN>` and checks DB connectivity plus required environment
presence.

Example runtime config update:

```bash
curl -X PUT "$BASE_URL/api/admin/indexer-config" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "rpcUrl": "https://...",
    "observerSyncIntervalSeconds": 3600,
    "mirrorPublishIntervalSeconds": 86400,
    "mirrorPublishAccount": "the-great-first-channel"
  }'
```
