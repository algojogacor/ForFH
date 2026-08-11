import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { executeAIRequest } from "@/lib/ai/router";
import { QuickCaptureSchema } from "@/lib/ai/schemas";
import { QUICK_CAPTURE_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { formatDateIndonesian } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { input } = body;

  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "Input teks tugas wajib diisi." }, { status: 400 });
  }

  // Get user's course names for context
  const userCourses = await db.query.courses.findMany({
    where: eq(courses.userId, user.id),
  });
  const coursesList = userCourses.map((c) => c.name).join(", ") || "Belum ada mata kuliah";

  const todayContext = `${formatDateIndonesian(new Date(), true)} (Zona Waktu: ${user.settings.timezone})`;
  const systemPrompt = QUICK_CAPTURE_SYSTEM_PROMPT.replace(
    "{{TODAY_CONTEXT}}",
    todayContext
  ).replace("{{COURSES_LIST}}", coursesList);

  const result = await executeAIRequest({
    prompt: input,
    systemPrompt,
    responseSchema: QuickCaptureSchema,
    requestType: "task_parse",
    userId: user.id,
  });

  if (result.success && result.data) {
    let raw = result.data;
    if (raw.tasks && Array.isArray(raw.tasks) && raw.tasks.length > 0) {
      raw = raw.tasks[0];
    }

    const title = raw.title || raw.task_name || input.trim();
    const courseGuess = raw.courseGuess || raw.course || raw.course_name || null;
    const dueDate = raw.dueDate || raw.due_date || null;
    const dueTime = raw.dueTime || raw.due_time || null;
    const type = raw.type || "assignment";
    const priority = raw.priority || "medium";
    const estimatedMinutes = raw.estimatedMinutes || raw.estimated_minutes || null;
    const notes = raw.notes || raw.description || null;

    // Attempt to match courseGuess with actual course ID
    let matchedCourseId: string | null = null;
    if (courseGuess) {
      const guessLower = String(courseGuess).toLowerCase();
      const matched = userCourses.find(
        (c) =>
          c.name.toLowerCase().includes(guessLower) ||
          guessLower.includes(c.name.toLowerCase()) ||
          (c.code && c.code.toLowerCase() === guessLower)
      );
      if (matched) {
        matchedCourseId = matched.id;
      }
    }

    return NextResponse.json({
      success: true,
      parsed: {
        title,
        courseGuess,
        courseId: matchedCourseId,
        type,
        dueDate,
        dueTime,
        priority,
        estimatedMinutes,
        notes,
      },
    });
  }

  // Fallback if AI is unconfigured or failed: simple heuristic fallback
  return NextResponse.json({
    success: true,
    fallbackUsed: true,
    parsed: {
      title: input.trim(),
      courseGuess: null,
      courseId: null,
      type: "assignment",
      dueDate: null,
      dueTime: null,
      priority: "medium",
      estimatedMinutes: null,
      notes: null,
    },
  });
}
