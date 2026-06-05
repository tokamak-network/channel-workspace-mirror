import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OBSERVER_RPC_TIMEOUT_MS,
  defaultObserverRpcTimeoutMs,
  effectiveObserverRpcTimeoutMs,
} from "../lib/indexer/config";

test("uses the default observer RPC timeout when env and config are unset", () => {
  withEnv(undefined, () => {
    assert.equal(defaultObserverRpcTimeoutMs(), DEFAULT_OBSERVER_RPC_TIMEOUT_MS);
    assert.equal(effectiveObserverRpcTimeoutMs({ observer_rpc_timeout_ms: null }), DEFAULT_OBSERVER_RPC_TIMEOUT_MS);
  });
});

test("uses OBSERVER_RPC_TIMEOUT_MS as a host-level default", () => {
  withEnv("90000", () => {
    assert.equal(defaultObserverRpcTimeoutMs(), 90_000);
    assert.equal(effectiveObserverRpcTimeoutMs({ observer_rpc_timeout_ms: null }), 90_000);
  });
});

test("prefers runtime config observer RPC timeout over env default", () => {
  withEnv("90000", () => {
    assert.equal(effectiveObserverRpcTimeoutMs({ observer_rpc_timeout_ms: 120_000 }), 120_000);
  });
});

test("rejects invalid observer RPC timeout values", () => {
  withEnv("0", () => {
    assert.throws(() => defaultObserverRpcTimeoutMs(), /OBSERVER_RPC_TIMEOUT_MS must be a positive integer/u);
  });
  assert.throws(
    () => effectiveObserverRpcTimeoutMs({ observer_rpc_timeout_ms: -1 }),
    /observer_rpc_timeout_ms must be a positive integer/u,
  );
});

function withEnv(value: string | undefined, fn: () => void) {
  const previous = process.env.OBSERVER_RPC_TIMEOUT_MS;
  if (value === undefined) {
    delete process.env.OBSERVER_RPC_TIMEOUT_MS;
  } else {
    process.env.OBSERVER_RPC_TIMEOUT_MS = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env.OBSERVER_RPC_TIMEOUT_MS;
    } else {
      process.env.OBSERVER_RPC_TIMEOUT_MS = previous;
    }
  }
}
