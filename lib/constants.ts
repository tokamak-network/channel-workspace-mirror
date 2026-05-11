export const MIRROR_PROTOCOL_VERSION = 2;
export const MIRROR_PATH_PREFIX = ".well-known/tokamak-private-state/channel-workspace";

export const CHECKPOINT_FILES = new Set([
  "workspace.json",
  "state_snapshot.json",
  "block_info.json",
  "contract_codes.json",
]);
