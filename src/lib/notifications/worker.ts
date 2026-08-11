import crypto from "crypto";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  db,
  userSettings,
  classSchedules,
  courses,
  tasks,
  notificationDeliveries,
  pushSubscriptions,
} from "../db";
import { sendPushToUser } from "./web-push";
import { logger } from "../logger";

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

  // Find all users who have active push subscriptions
  const activeUsers = await db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions);

  let notificationsSent = 0;

  for (const { userId } of activeUsers) {
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
            // Check if already sent (deduplication)
            const existing = await db.query.notificationDeliveries.findFirst({
              where: and(
                eq(notificationDeliveries.userId, userId),
                eq(notificationDeliveries.entityType, "class"),
                eq(notificationDeliveries.entityId, item.scheduleId),
                eq(notificationDeliveries.occurrenceAt, new Date(occurrenceAt)),
                eq(notificationDeliveries.offsetMinutes, offset)
              ),
            });

            if (!existing) {
              const isPrimary = offset === 240;
              const title = isPrimary
                ? `🔔 Peringatan Kuliah: ${item.courseName}`
                : `⏰ Segera Masuk: ${item.courseName}`;
              const body = isPrimary
                ? `Kuliah dimulai 4 jam lagi pukul ${item.startTime}${item.room ? ` di Ruang ${item.room}` : ""}. Siapkan materi Anda.`
                : `Kuliah dimulai dalam ${minutesUntilClass} menit (pukul ${item.startTime})${item.room ? ` di Ruang ${item.room}` : ""}.`;

              const res = await sendPushToUser(userId, {
                title,
                body,
                data: {
                  url: "/jadwal",
                  entityType: "class",
                  entityId: item.scheduleId,
                },
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
                  channel: "web_push",
                  status: "SENT",
                  sentAt: new Date(),
                });
              }
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

      for (const task of upcomingTasks) {
        if (!task.dueAt) continue;
        const dueTimestamp = task.dueAt.getTime();
        const minutesUntilDue = Math.floor((dueTimestamp - now.getTime()) / (1000 * 60));

        if (minutesUntilDue <= 0) continue; // Skip overdue

        for (const offset of taskOffsets) {
          if (minutesUntilDue <= offset && minutesUntilDue > offset - 5) {
            const existing = await db.query.notificationDeliveries.findFirst({
              where: and(
                eq(notificationDeliveries.userId, userId),
                eq(notificationDeliveries.entityType, "task"),
                eq(notificationDeliveries.entityId, task.id),
                eq(notificationDeliveries.occurrenceAt, new Date(dueTimestamp)),
                eq(notificationDeliveries.offsetMinutes, offset)
              ),
            });

            if (!existing) {
              let offsetLabel = `${offset} menit`;
              if (offset >= 1440) {
                offsetLabel = `${Math.round(offset / 1440)} hari`;
              } else if (offset >= 60) {
                offsetLabel = `${Math.round(offset / 60)} jam`;
              }

              const title = `📝 Pengingat Tugas: ${task.title}`;
              const body = `Tenggat waktu ${offsetLabel} lagi. Segera periksa progres pengerjaan Anda.`;

              const res = await sendPushToUser(userId, {
                title,
                body,
                data: {
                  url: "/tugas",
                  entityType: "task",
                  entityId: task.id,
                },
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
                  channel: "web_push",
                  status: "SENT",
                  sentAt: new Date(),
                });
              }
            }
          }
        }
      }
    } catch (userErr) {
      logger.error(`Error processing reminders for user ${userId}:`, userErr);
    }
  }

  return { processedUsers: activeUsers.length, notificationsSent };
}
