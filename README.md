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

Run the sync job from an operator environment with DB credentials and an Ethereum RPC URL:

```bash
OBSERVER_RPC_URL=https://... npm run observer:sync
```

The sync job indexes public L1 events for the configured channel and stores decoded event rows in
Neon. Vercel serves the observer page and API from the indexed rows; long-running indexing should
run as a cron, worker, GitHub Actions job, or local `launchd` job rather than inside a request
handler.

## Health

```text
GET /api/health
GET /api/admin/health
```

`/api/health` is public liveness. `/api/admin/health` requires
`Authorization: Bearer <ADMIN_TOKEN>` and checks DB connectivity plus required environment
presence.
