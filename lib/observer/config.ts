export type ObserverChannelConfig = {
  slug: string;
  chainId: number;
  channelId: string;
  name: string;
  dappId: number;
  genesisBlock: bigint;
  bridgeCore: `0x${string}`;
  channelManager: `0x${string}`;
  bridgeTokenVault: `0x${string}`;
  canonicalAsset: `0x${string}`;
  controller: `0x${string}`;
  l2AccountingVault: `0x${string}`;
  leader: `0x${string}`;
  dappMetadataDigestSchema: `0x${string}`;
  dappMetadataDigest: `0x${string}`;
  functionRoot: `0x${string}`;
  grothVerifier: `0x${string}`;
  grothVerifierVersion: string;
  tokamakVerifier: `0x${string}`;
  tokamakVerifierVersion: string;
  sourceCodeUrl: string;
  abiUrl: string;
  adminWallet: `0x${string}`;
};

export const DEFAULT_OBSERVER_CHANNEL: ObserverChannelConfig = {
  slug: "the-great-first-channel",
  chainId: 1,
  channelId: "108336797649051254585401751173864353497144788660297920004548699607442466523065",
  name: "the-great-first-channel",
  dappId: 1,
  genesisBlock: 25018368n,
  bridgeCore: "0x992E2Ae206620d811832a8F697c526c4f95974b6",
  channelManager: "0x3108d92A38bFb4B3396DE7ad4D92318a8fbE61D7",
  bridgeTokenVault: "0xf127Aef661c815ad46c5159146078f6F1E9f5F61",
  canonicalAsset: "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5",
  controller: "0x67C6233A99D9f122Fef9DC111e89948107b34c2F",
  l2AccountingVault: "0x9A6c9eb158269BBEd8885649F95aCEFA8AAfC3aA",
  leader: "0x32e6EE3d9820F0843E3e596132368747d36425F0",
  dappMetadataDigestSchema: "0xc2d8278e5129f8263782de4f76198a90fe23bf8f776c3f3bbe2835174c5cad92",
  dappMetadataDigest: "0x24ce1b24d4b0c085b713574c3f1eb8861ac18200263a3d20da1b87ce56c2fe04",
  functionRoot: "0x6954ea4661cff62a888de1898b69fa5b9861bcebc33a966c7b02b65ac10f1f6e",
  grothVerifier: "0xC1523baF508B5d45663Cb69fc0cA7F35e82101eB",
  grothVerifierVersion: "0.2",
  tokamakVerifier: "0xfC0BaCc0628BafAcB7Ce52fde21680caAA3cC9E1",
  tokamakVerifierVersion: "2.1",
  sourceCodeUrl: "https://github.com/tokamak-network/Tokamak-zk-EVM-contracts",
  abiUrl:
    "https://github.com/tokamak-network/Tokamak-zk-EVM-contracts/tree/main/bridge/deployments",
  adminWallet: "0x850dD0721B93D455b55bdf1324595fA1BD2B3ce7",
};

export function getObserverRpcUrl() {
  const rpcUrl = process.env.OBSERVER_RPC_URL ?? process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error("OBSERVER_RPC_URL or RPC_URL is required for observer sync.");
  }
  return rpcUrl;
}

export function getObserverBatchSize() {
  const raw = process.env.OBSERVER_SYNC_BATCH_SIZE ?? process.env.RPC_BLOCK_RANGE_CAP ?? "2000";
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("OBSERVER_SYNC_BATCH_SIZE must be a positive integer.");
  }
  return value;
}

export function getObserverConfirmations() {
  const raw = process.env.OBSERVER_CONFIRMATIONS ?? "12";
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("OBSERVER_CONFIRMATIONS must be a non-negative integer.");
  }
  return BigInt(value);
}
