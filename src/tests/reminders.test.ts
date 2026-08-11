import { formatDateIndonesian, formatRelativeTimeIndonesian } from "../lib/utils";

export async function runReminderTests(assert: (condition: boolean, name: string) => void) {
  console.log("\n--- 6. Reminder Windows & Notification Deduplication Tests ---");

  // 1. Indonesian Date Formatting
  const independenceDay = new Date("2026-08-17T10:00:00Z");
  const formatted = formatDateIndonesian(independenceDay, false);
  assert(formatted.includes("Agustus 2026"), "Month formatted in Indonesian (Agustus)");

  // 2. Relative Countdown Formatting
  const inTwoHours = new Date(Date.now() + 2 * 3600 * 1000);
  const relFuture = formatRelativeTimeIndonesian(inTwoHours);
  assert(!relFuture.isOverdue, "Upcoming event correctly labeled as non-overdue");
  assert(relFuture.text.includes("jam"), "Relative countdown indicates hours remaining");

  const overdueOneHour = new Date(Date.now() - 3600 * 1000);
  const relOverdue = formatRelativeTimeIndonesian(overdueOneHour);
  assert(relOverdue.isOverdue, "Past event labeled as overdue");
  assert(relOverdue.text.toLowerCase().includes("terlambat"), "Overdue label contains 'terlambat'");

  // 3. Deduplication Key Uniqueness Logic
  function generateDeliveryKey(
    userId: string,
    entityType: string,
    entityId: string,
    occurrenceAt: number,
    offsetMinutes: number
  ): string {
    return `${userId}:${entityType}:${entityId}:${occurrenceAt}:${offsetMinutes}`;
  }

  const key1 = generateDeliveryKey("u1", "class", "sch-100", 1755410400000, 120);
  const key2 = generateDeliveryKey("u1", "class", "sch-100", 1755410400000, 120);
  const keyDifferentOffset = generateDeliveryKey("u1", "class", "sch-100", 1755410400000, 60);

  assert(key1 === key2, "Identical reminder execution generates identical deduplication key");
  assert(key1 !== keyDifferentOffset, "Distinct notification offsets generate distinct delivery keys");
}
