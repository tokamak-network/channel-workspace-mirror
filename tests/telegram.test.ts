import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMirrorFailureMessage,
  formatMirrorUploadCompletionMessage,
  notifyMirrorUploadCompletion,
  notifyMirrorUploadFailure,
  type MirrorFailureNotificationInput,
  type MirrorUploadNotificationInput,
} from "../lib/telegram";

test("formats mirror failure notifications with operational context", () => {
  const message = formatMirrorFailureMessage(notificationInput({
    errorMessage: "RPC request timed out for eth_getLogs fromBlock=1 toBlock=2",
    stage: "observer_sync",
  }));

  assert.match(message, /Mirror upload failed/u);
  assert.match(message, /Channel: the-great-first-channel/u);
  assert.match(message, /Status: failed/u);
  assert.match(message, /Stage: observer_sync/u);
  assert.match(message, /Last mirror success: 2026-06-01T15:15:11.290Z/u);
  assert.match(message, /Worker: worker-a/u);
  assert.match(message, /Error: RPC request timed out/u);
});

test("formats mirror success notifications with operational context", () => {
  const message = formatMirrorUploadCompletionMessage(completionInput({
    status: "succeeded",
    stage: "upload",
    checkpointBlock: 25252923,
  }));

  assert.match(message, /Mirror upload succeeded/u);
  assert.match(message, /Status: succeeded/u);
  assert.match(message, /Stage: upload/u);
  assert.match(message, /Checkpoint block: 25252923/u);
  assert.doesNotMatch(message, /Error:/u);
});

test("skips Telegram send when mirror notification configuration is missing", async () => {
  let called = false;
  const { messages, result } = await captureConsoleError(async () => {
    return notifyMirrorUploadCompletion(completionInput(), {}, async () => {
      called = true;
      return new Response(null, { status: 200 });
    });
  });

  assert.deepEqual(result, { sent: false, reason: "missing_config" });
  assert.equal(called, false);
  assert.match(messages.join("\n"), /TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required/u);
});

test("sends mirror completion notifications to Telegram", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const result = await notifyMirrorUploadCompletion(
    completionInput({ status: "succeeded" }),
    {
      TELEGRAM_BOT_TOKEN: "123456:token",
      TELEGRAM_CHAT_ID: "98765",
    },
    async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  );

  assert.deepEqual(result, { sent: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://api.telegram.org/bot123456:token/sendMessage");
  assert.equal(requests[0]?.init?.method, "POST");

  const body = JSON.parse(String(requests[0]?.init?.body)) as {
    chat_id?: string;
    text?: string;
    disable_web_page_preview?: boolean;
  };
  assert.equal(body.chat_id, "98765");
  assert.equal(body.disable_web_page_preview, true);
  assert.match(body.text ?? "", /Mirror upload succeeded/u);
  assert.match(body.text ?? "", /Status: succeeded/u);
  assert.match(body.text ?? "", /Stage: upload/u);
});

test("keeps mirror failure notification helper compatible", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const result = await notifyMirrorUploadFailure(
    notificationInput({ stage: "observer_sync" }),
    {
      TELEGRAM_BOT_TOKEN: "123456:token",
      TELEGRAM_CHAT_ID: "98765",
    },
    async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  );

  assert.deepEqual(result, { sent: true });
  const body = JSON.parse(String(requests[0]?.init?.body)) as { text?: string };
  assert.match(body.text ?? "", /Mirror upload failed/u);
  assert.match(body.text ?? "", /Status: failed/u);
  assert.match(body.text ?? "", /Stage: observer_sync/u);
});

test("does not throw when Telegram API rejects a mirror failure notification", async () => {
  const { messages, result } = await captureConsoleError(async () => {
    return notifyMirrorUploadCompletion(
      completionInput({ status: "failed", errorMessage: "upload failed" }),
      {
        TELEGRAM_BOT_TOKEN: "123456:token",
        TELEGRAM_CHAT_ID: "98765",
      },
      async () => new Response("bad request", { status: 400 }),
    );
  });

  assert.deepEqual(result, { sent: false, reason: "send_failed" });
  assert.match(messages.join("\n"), /Telegram API returned 400/u);
});

function notificationInput(overrides: Partial<MirrorFailureNotificationInput> = {}): MirrorFailureNotificationInput {
  const base = completionInput({ status: "failed", errorMessage: "upload failed" });
  return {
    ...base,
    errorMessage: base.errorMessage ?? "upload failed",
    ...overrides,
  };
}

function completionInput(overrides: Partial<MirrorUploadNotificationInput> = {}): MirrorUploadNotificationInput {
  return {
    channelName: "the-great-first-channel",
    channelSlug: "the-great-first-channel",
    occurredAt: new Date("2026-06-05T10:00:00.000Z"),
    status: "succeeded",
    stage: "upload",
    lastMirrorSuccessAt: "2026-06-01T15:15:11.290Z",
    checkpointBlock: 25223353,
    workerHost: "worker-a",
    ...overrides,
  };
}

async function captureConsoleError<T>(fn: () => Promise<T>) {
  const original = console.error;
  const messages: string[] = [];
  console.error = (message?: unknown) => {
    messages.push(String(message));
  };
  try {
    return {
      messages,
      result: await fn(),
    };
  } finally {
    console.error = original;
  }
}
