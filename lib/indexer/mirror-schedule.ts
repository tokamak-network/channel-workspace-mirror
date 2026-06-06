const SINGAPORE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAILY_MIRROR_PUBLISH_HOUR = 15;
const DAILY_MIRROR_PUBLISH_MINUTE = 0;

export const DAILY_MIRROR_PUBLISH_TIME_ZONE = "Asia/Singapore";
export const DAILY_MIRROR_PUBLISH_LOCAL_TIME = "15:00";

export function isDailyMirrorPublishDue(lastRunAt: string | null, now = new Date()) {
  const nowLocal = singaporeDateParts(now);
  const scheduledMinute = DAILY_MIRROR_PUBLISH_HOUR * 60 + DAILY_MIRROR_PUBLISH_MINUTE;
  if (nowLocal.minuteOfDay < scheduledMinute) {
    return false;
  }
  if (!lastRunAt) {
    return true;
  }

  const lastRunMs = Date.parse(lastRunAt);
  if (!Number.isFinite(lastRunMs)) {
    return true;
  }
  const lastRunLocal = singaporeDateParts(new Date(lastRunMs));
  if (lastRunLocal.dayKey !== nowLocal.dayKey) {
    return true;
  }
  return lastRunLocal.minuteOfDay < scheduledMinute;
}

function singaporeDateParts(date: Date) {
  const shifted = new Date(date.getTime() + SINGAPORE_UTC_OFFSET_MS);
  const dayKey = shifted.toISOString().slice(0, 10);
  return {
    dayKey,
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}
