import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { executeAIRequest } from "@/lib/ai/router";
import { TaskBreakdownSchema } from "@/lib/ai/schemas";
import { TASK_BREAKDOWN_SYSTEM_PROMPT } from "@/lib/ai/prompts";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, courseName, type } = body;

  if (!title) {
    return NextResponse.json({ error: "Judul tugas wajib diisi." }, { status: 400 });
  }

  const userPrompt = `
Tugas: ${title}
Mata Kuliah: ${courseName || "-"}
Jenis Tugas: ${type || "Tugas"}
Deskripsi: ${description || "-"}

Pecah tugas di atas menjadi langkah-langkah subtask terstruktur yang praktis untuk mahasiswa hukum/universitas.
`.trim();

  const result = await executeAIRequest({
    prompt: userPrompt,
    systemPrompt: TASK_BREAKDOWN_SYSTEM_PROMPT,
    responseSchema: TaskBreakdownSchema,
    requestType: "breakdown",
    userId: user.id,
  });

  if (result.success && result.data) {
    return NextResponse.json({ success: true, breakdown: result.data });
  }

  // Fallback default steps if AI unavailable
  return NextResponse.json({
    success: true,
    fallbackUsed: true,
    breakdown: {
      overview: "Rencana pengerjaan standar",
      subtasks: [
        { title: "Riset literatur dan dasar hukum", estimatedMinutes: 45, orderIndex: 1 },
        { title: "Susun kerangka / outline pembahasan", estimatedMinutes: 30, orderIndex: 2 },
        { title: "Tulis draf pendahuluan & analisis", estimatedMinutes: 90, orderIndex: 3 },
        { title: "Revisi, rapikan format, dan periksa sitasi", estimatedMinutes: 30, orderIndex: 4 },
        { title: "Finalisasi dan submit tugas", estimatedMinutes: 15, orderIndex: 5 },
      ],
    },
  });
}
