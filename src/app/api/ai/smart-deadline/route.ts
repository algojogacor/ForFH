import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, classSchedules, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { executeAIRequest } from "@/lib/ai/router";
import { SmartDeadlineSchema } from "@/lib/ai/schemas";
import { SMART_DEADLINE_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { formatDateIndonesian, getIndonesianDayName } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, dueAt, estimatedHours, courseName } = body;

  if (!title || !dueAt) {
    return NextResponse.json({ error: "Judul dan deadline wajib diisi." }, { status: 400 });
  }

  // Get user's weekly schedules for context
  const userSchedules = await db
    .select({
      courseName: courses.name,
      dayOfWeek: classSchedules.dayOfWeek,
      startTime: classSchedules.startTime,
      endTime: classSchedules.endTime,
    })
    .from(classSchedules)
    .innerJoin(courses, eq(classSchedules.courseId, courses.id))
    .where(eq(classSchedules.userId, user.id));

  const scheduleSummary = userSchedules
    .map(
      (s) => `${getIndonesianDayName(s.dayOfWeek)}: ${s.courseName} (${s.startTime}-${s.endTime})`
    )
    .join("; ") || "Tidak ada jadwal kuliah tetap.";

  const now = new Date();
  const dueDate = new Date(dueAt);

  const systemPrompt = SMART_DEADLINE_SYSTEM_PROMPT.replace(
    "{{DUE_DATE}}",
    formatDateIndonesian(dueDate, true)
  )
    .replace("{{ESTIMATED_HOURS}}", (estimatedHours || 6).toString())
    .replace("{{SCHEDULE_SUMMARY}}", scheduleSummary)
    .replace("{{TODAY_DATE}}", formatDateIndonesian(now, false));

  const userPrompt = `
Tugas: ${title}
Mata Kuliah: ${courseName || "-"}
Hard Deadline: ${formatDateIndonesian(dueDate, true)}
Estimasi Durasi: ${estimatedHours || 6} jam

Buatkan jadwal pengerjaan bertahap (Smart Deadline) dengan target internal yang aman.
`.trim();

  const result = await executeAIRequest({
    prompt: userPrompt,
    systemPrompt,
    responseSchema: SmartDeadlineSchema,
    requestType: "smart_deadline",
    userId: user.id,
  });

  if (result.success && result.data) {
    return NextResponse.json({ success: true, plan: result.data });
  }

  // Heuristic safety fallback
  const internalBufferDate = new Date(dueDate.getTime() - 12 * 60 * 60 * 1000);
  return NextResponse.json({
    success: true,
    fallbackUsed: true,
    plan: {
      overview: "Jadwal pengerjaan bertahap 3 hari sebelum deadline.",
      internalTargetDate: internalBufferDate.toISOString().slice(0, 16).replace("T", " "),
      bufferHours: 12,
      milestones: [
        {
          title: "Riset dasar hukum & bahan referensi",
          scheduledDate: now.toISOString().slice(0, 10),
          scheduledTime: "19:00",
          estimatedMinutes: 60,
          phase: "Riset",
        },
        {
          title: "Penulisan draf analisis utama",
          scheduledDate: internalBufferDate.toISOString().slice(0, 10),
          scheduledTime: "16:00",
          estimatedMinutes: 120,
          phase: "Drafting",
        },
        {
          title: "Revisi akhir & penyesuaian format",
          scheduledDate: internalBufferDate.toISOString().slice(0, 10),
          scheduledTime: "20:00",
          estimatedMinutes: 45,
          phase: "Finalisasi",
        },
      ],
    },
  });
}
