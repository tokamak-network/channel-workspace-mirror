import { parseAbi } from "viem";

export const observerAbi = parseAbi([
  "event ChannelCreated(uint256 indexed channelId,uint256 indexed dappId,address manager,address bridgeTokenVault)",
  "event ChannelWorkspaceMirrorUpdated(uint256 indexed channelId,address indexed leader,string previousUri,string newUri)",
  "event GrothVerifierUpdated(address indexed grothVerifier)",
  "event TokamakVerifierUpdated(address indexed tokamakVerifier)",
  "event ChannelTokenVaultIdentityRegistered(address indexed l1Address,address indexed l2Address,bytes32 indexed channelTokenVaultKey,uint256 leafIndex,uint256 joinTollPaid,uint64 joinedAt,bytes32 noteReceivePubKeyX,uint8 noteReceivePubKeyYParity)",
  "event ChannelTokenVaultIdentityExited(address indexed l1Address,uint256 indexed leafIndex)",
  "event JoinTollUpdated(uint256 previousJoinToll,uint256 newJoinToll)",
  "event CurrentRootVectorObserved(bytes32 indexed rootVectorHash,bytes32[] rootVector)",
  "event AssetsFunded(address indexed user,uint256 amount)",
  "event AssetsClaimed(address indexed user,uint256 amount)",
  "event ChannelJoinTollPaid(address indexed user,uint256 indexed channelId,uint256 amount)",
  "event ChannelExitRefunded(address indexed user,uint256 indexed channelId,uint256 amount,uint16 refundBps)",
  "event StorageWriteObserved(address indexed storageAddr,uint256 storageKey,uint256 value)",
  "event NoteValueEncrypted(bytes32[3] encryptedNoteValue)",
  "event StorageKeyObserved(bytes32 storageKey)",
  "event LiquidBalanceStorageWriteObserved(address l2Address,bytes32 value)",
  "event Upgraded(address indexed implementation)",
  "event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)",
]);

const eventGroups: Record<string, string> = {
  ChannelCreated: "channel_registration",
  ChannelWorkspaceMirrorUpdated: "mirror",
  GrothVerifierUpdated: "verifier",
  TokamakVerifierUpdated: "verifier",
  ChannelTokenVaultIdentityRegistered: "participant",
  ChannelTokenVaultIdentityExited: "participant",
  JoinTollUpdated: "policy",
  CurrentRootVectorObserved: "transition",
  AssetsFunded: "deposit",
  AssetsClaimed: "withdrawal",
  ChannelJoinTollPaid: "deposit",
  ChannelExitRefunded: "withdrawal",
  StorageWriteObserved: "l2_accounting",
  NoteValueEncrypted: "encrypted_payload",
  StorageKeyObserved: "commitment_or_nullifier",
  LiquidBalanceStorageWriteObserved: "l2_accounting",
  Upgraded: "upgrade",
  OwnershipTransferred: "admin",
};

export function eventGroupFor(eventName: string) {
  return eventGroups[eventName] ?? "other";
}
