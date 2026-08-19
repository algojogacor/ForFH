import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, notificationDeliveries, courses, classSchedules, tasks } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawLogs = await db
      .select({
        id: notificationDeliveries.id,
        entityType: notificationDeliveries.entityType,
        entityId: notificationDeliveries.entityId,
        occurrenceAt: notificationDeliveries.occurrenceAt,
        offsetMinutes: notificationDeliveries.offsetMinutes,
        channel: notificationDeliveries.channel,
        status: notificationDeliveries.status,
        sentAt: notificationDeliveries.sentAt,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, user.id))
      .orderBy(desc(notificationDeliveries.sentAt))
      .limit(50);

    // Ambil nama course/task untuk memperkaya log
    const enrichedLogs = await Promise.all(
      rawLogs.map(async (log) => {
        let title = "Pengingat Akademik";
        if (log.entityType === "class") {
          const schedule = await db
            .select({ courseName: courses.name, room: classSchedules.room, startTime: classSchedules.startTime })
            .from(classSchedules)
            .innerJoin(courses, eq(classSchedules.courseId, courses.id))
            .where(eq(classSchedules.id, log.entityId))
            .limit(1)
            .then((r) => r[0]);

          if (schedule) {
            title = `Kuliah: ${schedule.courseName} (${schedule.startTime}${schedule.room ? ` - R.${schedule.room}` : ""})`;
          }
        } else if (log.entityType === "task") {
          const task = await db
            .select({ taskTitle: tasks.title })
            .from(tasks)
            .where(eq(tasks.id, log.entityId))
            .limit(1)
            .then((r) => r[0]);

          if (task) {
            title = `Tugas: ${task.taskTitle}`;
          }
        }

        let offsetLabel = `${log.offsetMinutes}m`;
        if (log.offsetMinutes >= 1440) {
          offsetLabel = `H-${Math.round(log.offsetMinutes / 1440)} hari`;
        } else if (log.offsetMinutes >= 60) {
          offsetLabel = `H-${Math.round(log.offsetMinutes / 60)} jam`;
        } else {
          offsetLabel = `H-${log.offsetMinutes} menit`;
        }

        return {
          id: log.id,
          entityType: log.entityType,
          title,
          offsetMinutes: log.offsetMinutes,
          offsetLabel,
          channel: log.channel, // "whatsapp" | "web_push" | "none"
          status: log.status,   // "SENT" | "FAILED"
          sentAt: log.sentAt,
        };
      })
    );

    return NextResponse.json({
      success: true,
      logs: enrichedLogs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Gagal memuat log notifikasi: " + (err?.message || err) },
      { status: 500 }
    );
  }
}
