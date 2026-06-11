import assert from "node:assert/strict";
import test from "node:test";
import { toEventSelector } from "viem";
import { DEFAULT_OBSERVER_CHANNEL } from "../lib/observer/config";
import {
  TARGETED_EVENT_SYNC_KEY,
  targetedEventNames,
  targetedLogFilter,
  targetedScanRanges,
} from "../lib/observer/sync";

const EXPECTED_TARGETED_EVENT_NAMES = [
  "ChannelCreated",
  "ChannelWorkspaceMirrorUpdated",
  "GrothVerifierUpdated",
  "TokamakVerifierUpdated",
  "Upgraded",
  "OwnershipTransferred",
  "ChannelTokenVaultIdentityRegistered",
  "ChannelTokenVaultIdentityExited",
  "JoinTollUpdated",
  "JoinTollRefundScheduleUpdated",
  "NoteValueEncrypted",
  "AssetsFunded",
  "AssetsClaimed",
  "ChannelJoinTollPaid",
  "ChannelExitRefunded",
  "ChannelExitTollBurned",
  "ChannelOperationAbandoned",
];

test("builds one multi-address multi-topic targeted observer log filter", () => {
  const filter = targetedLogFilter(DEFAULT_OBSERVER_CHANNEL);

  assert.deepEqual(filter.addresses, [
    DEFAULT_OBSERVER_CHANNEL.bridgeCore,
    DEFAULT_OBSERVER_CHANNEL.channelManager,
    DEFAULT_OBSERVER_CHANNEL.bridgeTokenVault,
  ]);
  assert.deepEqual(
    filter.events.map((event) => event.name),
    EXPECTED_TARGETED_EVENT_NAMES,
  );
  assert.equal(new Set(filter.events.map((event) => toEventSelector(event))).size, filter.events.length);
});

test("uses one active targeted observer cursor key", () => {
  assert.equal(TARGETED_EVENT_SYNC_KEY, "targeted-observer-events-v2");
  assert.doesNotMatch(TARGETED_EVENT_SYNC_KEY, /^targeted:[^:]+:[^:]+$/u);
});

test("plans one targeted RPC request per block chunk", () => {
  assert.deepEqual(targetedScanRanges(10n, 19n, 3n), [
    { fromBlock: 10n, toBlock: 12n },
    { fromBlock: 13n, toBlock: 15n },
    { fromBlock: 16n, toBlock: 18n },
    { fromBlock: 19n, toBlock: 19n },
  ]);
  assert.deepEqual(targetedScanRanges(20n, 19n, 3n), []);
});

test("targeted event name helper matches the active multi-topic filter", () => {
  assert.deepEqual(targetedEventNames(), EXPECTED_TARGETED_EVENT_NAMES);
  assert.deepEqual(
    targetedLogFilter(DEFAULT_OBSERVER_CHANNEL).events.map((event) => event.name),
    targetedEventNames(),
  );
});
