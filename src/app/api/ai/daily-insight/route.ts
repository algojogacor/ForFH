import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull, asc } from "drizzle-orm";
import { db, classSchedules, courses, tasks, exams } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { executeAIRequest } from "@/lib/ai/router";
import { DailyInsightSchema } from "@/lib/ai/schemas";
import { DAILY_INSIGHT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { formatDateIndonesian, formatTime24 } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Fetch today's classes
  const todayClasses = await db
    .select({
      name: courses.name,
      room: classSchedules.room,
      startTime: classSchedules.startTime,
      endTime: classSchedules.endTime,
    })
    .from(classSchedules)
    .innerJoin(courses, eq(classSchedules.courseId, courses.id))
    .where(
      and(
        eq(classSchedules.userId, user.id),
        eq(classSchedules.enabled, 1),
        eq(classSchedules.dayOfWeek, currentDayOfWeek)
      )
    )
    .orderBy(asc(classSchedules.startTime));

  // Determine next class
  let nextClassStr = "Tidak ada kuliah lagi hari ini.";
  for (const c of todayClasses) {
    const [h, m] = c.startTime.split(":").map((x) => parseInt(x, 10));
    if (h * 60 + m >= currentMinutes) {
      nextClassStr = `${c.name} pukul ${c.startTime}${c.room ? ` (Ruang ${c.room})` : ""}`;
      break;
    }
  }

  // Fetch active tasks
  const activeTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, user.id),
      isNull(tasks.deletedAt),
      eq(tasks.status, "NOT_STARTED")
    ),
    orderBy: [asc(tasks.dueAt)],
    with: { course: true },
    limit: 6,
  });

  const overdueTasks = activeTasks.filter(
    (t) => t.dueAt && t.dueAt.getTime() < now.getTime()
  );
  const upcomingTasks = activeTasks.filter(
    (t) => !t.dueAt || t.dueAt.getTime() >= now.getTime()
  );

  // Fetch upcoming exams in next 30 days
  const upcomingExamsList = await db.query.exams.findMany({
    where: and(eq(exams.userId, user.id)),
    orderBy: [asc(exams.examAt)],
    with: { course: true },
    limit: 2,
  });

  const todayClassesStr =
    todayClasses.map((c) => `${c.startTime} ${c.name}`).join(", ") || "Tidak ada jadwal kuliah hari ini.";
  const upcomingTasksStr =
    upcomingTasks
      .map(
        (t) =>
          `${t.title}${t.course ? ` (${t.course.name})` : ""}${
            t.dueAt ? ` deadline ${formatDateIndonesian(t.dueAt, true)}` : ""
          }`
      )
      .join("; ") || "Tidak ada tugas mendesak.";
  const overdueTasksStr =
    overdueTasks.map((t) => `${t.title} (${t.course?.name || "Tugas"})`).join(", ") || "Nihil";
  const upcomingExamsStr =
    upcomingExamsList
      .map((e) => `${e.name} (${formatDateIndonesian(e.examAt, false)})`)
      .join(", ") || "Tidak ada ujian terdekat.";

  const systemPrompt = DAILY_INSIGHT_SYSTEM_PROMPT.replace(
    "{{CURRENT_TIME}}",
    `${formatTime24(now)} WIB`
  )
    .replace("{{TODAY_CLASSES}}", todayClassesStr)
    .replace("{{NEXT_CLASS}}", nextClassStr)
    .replace("{{UPCOMING_TASKS}}", upcomingTasksStr)
    .replace("{{OVERDUE_TASKS}}", overdueTasksStr)
    .replace("{{UPCOMING_EXAMS}}", upcomingExamsStr);

  const result = await executeAIRequest({
    prompt: `Berdasarkan agenda dan tugas di atas, berikan saran tindakan ringkas untuk menjawab: SEKARANG AKU HARUS NGAPAIN?`,
    systemPrompt,
    responseSchema: DailyInsightSchema,
    requestType: "daily_insight",
    userId: user.id,
  });

  if (result.success && result.data) {
    return NextResponse.json({ success: true, insight: result.data });
  }

  // Fallback direct heuristic response
  const firstTask = upcomingTasks[0] || overdueTasks[0];
  return NextResponse.json({
    success: true,
    fallbackUsed: true,
    insight: {
      greeting: "Semangat Belajar!",
      insight: firstTask
        ? `Fokus utamamu saat ini adalah menyelesaikan ${firstTask.title}. Mulai dengan langkah kecil sekarang juga.`
        : "Jadwalmu cukup tenang hari ini. Luangkan waktu untuk mencicil bacaan atau merapikan catatan kuliah.",
      urgentFocus: firstTask ? firstTask.title : null,
      suggestedAction: firstTask
        ? `Buka draf ${firstTask.title} dan cicil selama 25 menit.`
        : "Periksa kembali catatan materi kuliah minggu ini.",
    },
  });
}
