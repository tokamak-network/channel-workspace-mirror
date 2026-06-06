type TelegramFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
type TelegramEnv = {
  [key: string]: string | undefined;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

export type MirrorFailureStage = "configure_cli" | "recover_workspace" | "observer_sync" | "upload";

export type MirrorUploadNotificationInput = {
  channelName: string;
  channelSlug: string;
  occurredAt: Date;
  stage: MirrorFailureStage;
  status: "succeeded" | "failed";
  lastMirrorSuccessAt?: string | null;
  checkpointBlock?: string | number | null;
  workerHost?: string | null;
  errorMessage?: string | null;
};

export type MirrorFailureNotificationInput = Omit<MirrorUploadNotificationInput, "status"> & {
  errorMessage: string;
};

export type TelegramNotificationResult =
  | { sent: true }
  | { sent: false; reason: "missing_config" | "send_failed" };

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_SEND_TIMEOUT_MS = 10000;

export async function notifyMirrorUploadFailure(
  input: MirrorFailureNotificationInput,
  env: TelegramEnv = process.env,
  fetchImpl: TelegramFetch = fetch,
): Promise<TelegramNotificationResult> {
  return notifyMirrorUploadCompletion({ ...input, status: "failed" }, env, fetchImpl);
}

export async function notifyMirrorUploadCompletion(
  input: MirrorUploadNotificationInput,
  env: TelegramEnv = process.env,
  fetchImpl: TelegramFetch = fetch,
): Promise<TelegramNotificationResult> {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) {
    console.error("Telegram mirror upload notification was not sent: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.");
    return { sent: false, reason: "missing_config" };
  }

  try {
    await sendTelegramMessage({
      botToken,
      chatId,
      text: formatMirrorUploadCompletionMessage(input),
      fetchImpl,
    });
    return { sent: true };
  } catch (error) {
    console.error(`Telegram mirror upload notification failed: ${formatTelegramError(error, botToken)}`);
    return { sent: false, reason: "send_failed" };
  }
}

export function formatMirrorFailureMessage(input: MirrorFailureNotificationInput) {
  return formatMirrorUploadCompletionMessage({ ...input, status: "failed" });
}

export function formatMirrorUploadCompletionMessage(input: MirrorUploadNotificationInput) {
  const checkpointBlock = input.checkpointBlock === undefined || input.checkpointBlock === null
    ? "unknown"
    : String(input.checkpointBlock);
  const workerHost = input.workerHost?.trim() || "unknown";
  const lines = [
    input.status === "succeeded" ? "Mirror upload succeeded" : "Mirror upload failed",
    `Channel: ${input.channelName} (${input.channelSlug})`,
    `Status: ${input.status}`,
    `Stage: ${input.stage}`,
    `Time: ${input.occurredAt.toISOString()}`,
    `Last mirror success: ${input.lastMirrorSuccessAt ?? "never"}`,
    `Checkpoint block: ${checkpointBlock}`,
    `Worker: ${workerHost}`,
  ];
  if (input.status === "failed") {
    lines.push(`Error: ${input.errorMessage ?? "unknown"}`);
  }
  return truncateTelegramMessage(lines.join("\n"));
}

async function sendTelegramMessage({
  botToken,
  chatId,
  text,
  fetchImpl,
}: {
  botToken: string;
  chatId: string;
  text: string;
  fetchImpl: TelegramFetch;
}) {
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    signal: AbortSignal.timeout(TELEGRAM_SEND_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram API returned ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`);
  }
}

function formatTelegramError(error: unknown, botToken: string) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(botToken, "<redacted>");
}

function truncateTelegramMessage(message: string) {
  if (message.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
    return message;
  }
  const suffix = "\n... truncated";
  return `${message.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - suffix.length)}${suffix}`;
}
