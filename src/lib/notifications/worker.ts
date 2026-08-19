import crypto from "crypto";
import { eq, and, isNull, sql, gte, lt } from "drizzle-orm";
import {
  db,
  userSettings,
  classSchedules,
  courses,
  tasks,
  notificationDeliveries,
  pushSubscriptions,
  aiUsage,
  appConfig,
  waBindings,
} from "../db";
import { sendPushToUser } from "./web-push";
import { logger } from "../logger";
import { getWaSendService } from "../wa/send";
import { resolveWhatsAppTarget } from "../wa/identity";
import { formatKuliahReminder, formatTugasReminder } from "../wa/format";

// Jalankan fn atas items dengan maksimal `limit` tugas bersamaan
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Hapus log pemakaian AI lebih tua dari 90 hari — sekali sehari (guard app_config)
export async function cleanupOldUsage(): Promise<void> {
  try {
    const row = await db.select().from(appConfig).where(eq(appConfig.key, "ai_usage_cleanup_last")).limit(1).then((r) => r[0]);
    const lastMs = row ? Number(row.value) || 0 : 0;
    if (Date.now() - lastMs < 24 * 60 * 60 * 1000) return;
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await db.delete(aiUsage).where(lt(aiUsage.createdAt, cutoff));
    if (row) {
      await db.update(appConfig).set({ value: String(Date.now()), updatedAt: new Date() }).where(eq(appConfig.key, "ai_usage_cleanup_last"));
    } else {
      await db.insert(appConfig).values({ key: "ai_usage_cleanup_last", value: String(Date.now()) });
    }
  } catch (e: any) {
    logger.warn(`cleanupOldUsage: ${e?.message || e}`);
  }
}

/**
 * Routing channel notifikasi (D1): binding WA active → WhatsApp;
 * gagal → fallback web push. WA sukses → TIDAK dobel kirim push.
 */
export function decideDeliveryChannel(waSent: boolean, pushSent: number): "whatsapp" | "web_push" | "none" {
  if (waSent) return "whatsapp";
  if (pushSent > 0) return "web_push";
  return "none";
}

export interface ReminderPayload {
  push: { title: string; body: string; data: Record<string, string> };
  waText: string;
}

export interface WaReminderDeps {
  resolveTarget?: (binding: { jid?: string | null; lid?: string | null; phone: string }) => Promise<string | null>;
  sendStrict?: (jid: string, text: string) => Promise<{ sent: boolean }>;
}

/** Blok WA sendReminder — try/catch penuh (I4): throw apa pun (satu-satunya
 *  jalur realistis: dynamic import Baileys di resolveWhatsAppTarget) → false,
 *  sehingga `if (!waSent)` di sendReminder tetap menjalankan fallback web push
 *  (tanpa try/catch, error menembus dan notifikasi hilang utuh). */
export async function trySendWaReminder(
  binding: { jid?: string | null; lid?: string | null; phone: string },
  waText: string,
  deps: WaReminderDeps = {},
): Promise<boolean> {
  try {
    const target = await (deps.resolveTarget ?? resolveWhatsAppTarget)(binding);
    if (target) {
      // sendStrict: tanpa queue — gagal lama/cepat sama-sama failure seketika
      // (hindari pesan tertunda yang jadi dobel dengan fallback web push)
      const res = await (deps.sendStrict ?? getWaSendService().sendStrict)(target, waText);
      return res.sent;
    }
  } catch (err) {
    logger.warn("wa: kirim reminder gagal — fallback web push", err);
  }
  return false;
}

export async function sendReminder(
  userId: string,
  payload: ReminderPayload
): Promise<{ sentCount: number; channel: "whatsapp" | "web_push" | "none" }> {
  const binding = await db.query.waBindings.findFirst({
    where: and(eq(waBindings.userId, userId), eq(waBindings.status, "active")),
  });

  let waSent = false;
  if (binding) {
    waSent = await trySendWaReminder(binding, payload.waText);
  }

  let pushSent = 0;
  if (!waSent) {
    const res = await sendPushToUser(userId, payload.push);
    pushSent = res.sentCount;
  }
  return { sentCount: waSent ? 1 : pushSent, channel: decideDeliveryChannel(waSent, pushSent) };
}

/**
 * Worker process that evaluates upcoming classes and tasks for all subscribed users
 */
export async function processDueReminders(): Promise<{
  processedUsers: number;
  notificationsSent: number;
}> {
  const now = new Date();
  const currentDayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon ...
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Cap per tick: 50 user — ambil user yang punya Web Push ATAU WhatsApp aktif
  const pushUsers = await db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions);
  const waUsers = await db
    .selectDistinct({ userId: waBindings.userId })
    .from(waBindings)
    .where(eq(waBindings.status, "active"));

  const userIds = Array.from(
    new Set([...pushUsers.map((u) => u.userId), ...waUsers.map((u) => u.userId)])
  ).slice(0, 50);
  const activeUsers = userIds.map((userId) => ({ userId }));

  let notificationsSent = 0;

  await mapLimit(activeUsers, 5, async ({ userId }) => {
    try {
      const settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
      });

      const classOffsets: number[] = settings?.defaultClassReminders
        ? JSON.parse(settings.defaultClassReminders)
        : [120, 90, 60, 30, 20];

      const primaryWarningMinutes = settings?.primaryClassAlertMinutes || 240;
      const allClassOffsets = Array.from(new Set([...classOffsets, primaryWarningMinutes]));

      // 1. Evaluate Class Schedules for Today
      const schedules = await db
        .select({
          scheduleId: classSchedules.id,
          courseName: courses.name,
          room: classSchedules.room,
          startTime: classSchedules.startTime,
          dayOfWeek: classSchedules.dayOfWeek,
        })
        .from(classSchedules)
        .innerJoin(courses, eq(classSchedules.courseId, courses.id))
        .where(
          and(
            eq(classSchedules.userId, userId),
            eq(classSchedules.enabled, 1),
            eq(classSchedules.dayOfWeek, currentDayOfWeek)
          )
        );

      // Batch dedupe: 1 query untuk semua offset yang akan dicek hari ini
      const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
      const todayDeliveries = await db.select().from(notificationDeliveries).where(and(
        eq(notificationDeliveries.userId, userId),
        eq(notificationDeliveries.entityType, "class"),
        gte(notificationDeliveries.occurrenceAt, dayStart),
      ));
      const classSentKeys = new Set(todayDeliveries.map((d) =>
        `${d.entityId}|${d.occurrenceAt.getTime()}|${d.offsetMinutes}`
      ));

      for (const item of schedules) {
        const [startH, startM] = item.startTime.split(":").map((s) => parseInt(s, 10));
        const classStartMinutes = startH * 60 + startM;
        const minutesUntilClass = classStartMinutes - currentMinutes;

        // Calculate class occurrence date
        const occurrenceDate = new Date(now);
        occurrenceDate.setHours(startH, startM, 0, 0);
        const occurrenceAt = occurrenceDate.getTime();

        for (const offset of allClassOffsets) {
          // Trigger if within a 5-minute window of the offset
          if (minutesUntilClass <= offset && minutesUntilClass > offset - 5) {
            // Dedupe in-memory: 1 query batch di atas, tanpa findFirst per offset
            const sentKey = `${item.scheduleId}|${occurrenceAt}|${offset}`;
            if (classSentKeys.has(sentKey)) continue;

            const isPrimary = offset === 240;
            const title = isPrimary
              ? `🔔 Peringatan Kuliah: ${item.courseName}`
              : `⏰ Segera Masuk: ${item.courseName}`;
            const body = isPrimary
              ? `Kuliah dimulai 4 jam lagi pukul ${item.startTime}${item.room ? ` di Ruang ${item.room}` : ""}. Siapkan materi Anda.`
              : `Kuliah dimulai dalam ${minutesUntilClass} menit (pukul ${item.startTime})${item.room ? ` di Ruang ${item.room}` : ""}.`;

            const waText = formatKuliahReminder(item.courseName, item.room, item.startTime, minutesUntilClass, isPrimary);
            const res = await sendReminder(userId, {
              push: {
                title,
                body,
                data: { url: "/jadwal", entityType: "class", entityId: item.scheduleId },
              },
              waText,
            });

            if (res.sentCount > 0) {
              notificationsSent += res.sentCount;
              await db.insert(notificationDeliveries).values({
                id: crypto.randomUUID(),
                userId,
                entityType: "class",
                entityId: item.scheduleId,
                occurrenceAt: new Date(occurrenceAt),
                offsetMinutes: offset,
                channel: res.channel,
                status: "SENT",
                sentAt: new Date(),
              });
              classSentKeys.add(sentKey);
            }
          }
        }
      }

      // 2. Evaluate Task Deadlines
      const taskOffsets: number[] = settings?.defaultTaskReminders
        ? JSON.parse(settings.defaultTaskReminders)
        : [10080, 4320, 1440, 360, 60];

      const upcomingTasks = await db.query.tasks.findMany({
        where: and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          sql`${tasks.status} != 'DONE'`
        ),
      });

      // Batch dedupe task: 1 query untuk semua offset yang akan dicek hari ini
      const todayTaskDeliveries = await db.select().from(notificationDeliveries).where(and(
        eq(notificationDeliveries.userId, userId),
        eq(notificationDeliveries.entityType, "task"),
        gte(notificationDeliveries.occurrenceAt, dayStart),
      ));
      const taskSentKeys = new Set(todayTaskDeliveries.map((d) =>
        `${d.entityId}|${d.occurrenceAt.getTime()}|${d.offsetMinutes}`
      ));

      for (const task of upcomingTasks) {
        if (!task.dueAt) continue;
        const dueTimestamp = task.dueAt.getTime();
        const minutesUntilDue = Math.floor((dueTimestamp - now.getTime()) / (1000 * 60));

        if (minutesUntilDue <= 0) continue; // Skip overdue

        for (const offset of taskOffsets) {
          if (minutesUntilDue <= offset && minutesUntilDue > offset - 5) {
            // Dedupe in-memory: 1 query batch di atas, tanpa findFirst per offset
            const sentKey = `${task.id}|${dueTimestamp}|${offset}`;
            if (taskSentKeys.has(sentKey)) continue;

            let offsetLabel = `${offset} menit`;
            if (offset >= 1440) {
              offsetLabel = `${Math.round(offset / 1440)} hari`;
            } else if (offset >= 60) {
              offsetLabel = `${Math.round(offset / 60)} jam`;
            }

            const title = `📝 Pengingat Tugas: ${task.title}`;
            const body = `Tenggat waktu ${offsetLabel} lagi. Segera periksa progres pengerjaan Anda.`;

            const waText = formatTugasReminder(task.title, offsetLabel);
            const res = await sendReminder(userId, {
              push: {
                title,
                body,
                data: { url: "/tugas", entityType: "task", entityId: task.id },
              },
              waText,
            });

            if (res.sentCount > 0) {
              notificationsSent += res.sentCount;
              await db.insert(notificationDeliveries).values({
                id: crypto.randomUUID(),
                userId,
                entityType: "task",
                entityId: task.id,
                occurrenceAt: new Date(dueTimestamp),
                offsetMinutes: offset,
                channel: res.channel,
                status: "SENT",
                sentAt: new Date(),
              });
              taskSentKeys.add(sentKey);
            }
          }
        }
      }
    } catch (userErr) {
      logger.error(`Error processing reminders for user ${userId}:`, userErr);
    }
  });

  return { processedUsers: activeUsers.length, notificationsSent };
}

let reminderLoopTimer: NodeJS.Timeout | null = null;

/**
 * Loop background 60s internal di dalam container Koyeb (self-healing scheduler).
 * Memastikan notifikasi kuliah & tugas tetap terproses setiap 1 menit
 * bahkan jika webhook QStash belum disetel.
 */
export function startInternalReminderLoop(): void {
  if (reminderLoopTimer) return;
  reminderLoopTimer = setInterval(async () => {
    try {
      await processDueReminders();
    } catch (err) {
      logger.warn("internal reminder loop error:", err);
    }
  }, 60 * 1000);
}
