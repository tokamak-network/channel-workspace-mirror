import assert from "node:assert/strict";
import test from "node:test";
import { isDailyMirrorPublishDue } from "../lib/indexer/mirror-schedule";

test("daily mirror publish is not due before 15:00 Singapore time", () => {
  assert.equal(isDailyMirrorPublishDue(null, new Date("2026-06-06T06:59:59.000Z")), false);
});

test("daily mirror publish is due at 15:00 Singapore time when no run exists", () => {
  assert.equal(isDailyMirrorPublishDue(null, new Date("2026-06-06T07:00:00.000Z")), true);
});

test("daily mirror publish is due after 15:00 Singapore time if the last run was yesterday", () => {
  assert.equal(
    isDailyMirrorPublishDue("2026-06-05T18:18:43.463Z", new Date("2026-06-06T07:05:00.000Z")),
    true,
  );
});

test("daily mirror publish is not due after a same-day post-schedule run", () => {
  assert.equal(
    isDailyMirrorPublishDue("2026-06-06T07:01:00.000Z", new Date("2026-06-06T10:00:00.000Z")),
    false,
  );
});

test("daily mirror publish is due if the same-day run happened before 15:00 Singapore time", () => {
  assert.equal(
    isDailyMirrorPublishDue("2026-06-06T06:30:00.000Z", new Date("2026-06-06T07:05:00.000Z")),
    true,
  );
});

test("daily mirror publish treats invalid run timestamps as due after schedule time", () => {
  assert.equal(isDailyMirrorPublishDue("not-a-date", new Date("2026-06-06T07:05:00.000Z")), true);
});
