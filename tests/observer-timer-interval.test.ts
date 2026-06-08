import assert from "node:assert/strict";
import test from "node:test";
import { systemdInterval } from "../scripts/resolve-observer-timer-interval";

test("formats observer sync intervals for systemd timers", () => {
  assert.equal(systemdInterval(10800), "3h");
  assert.equal(systemdInterval(1800), "30min");
  assert.equal(systemdInterval(300), "5min");
  assert.equal(systemdInterval(45), "45s");
});

test("rejects invalid observer sync timer intervals", () => {
  assert.throws(() => systemdInterval(0), /positive integer/u);
  assert.throws(() => systemdInterval(1.5), /positive integer/u);
});
