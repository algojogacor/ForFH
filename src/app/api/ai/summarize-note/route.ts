import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { executeAIRequest } from "@/lib/ai/router";
import { NoteSummarySchema } from "@/lib/ai/schemas";
import { NOTE_SUMMARY_SYSTEM_PROMPT } from "@/lib/ai/prompts";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, content, courseName } = body;

  if (!content) {
    return NextResponse.json({ error: "Konten catatan tidak boleh kosong." }, { status: 400 });
  }

  const systemPrompt = NOTE_SUMMARY_SYSTEM_PROMPT.replace("{{NOTE_CONTENT}}", content);
  const userPrompt = `
Judul Catatan: ${title || "Catatan Kuliah"}
Mata Kuliah: ${courseName || "-"}

Buatkan ringkasan materi, ekstraksi asas/istilah hukum penting, dan pertanyaan uji pemahaman untuk belajar persiapan ujian.
`.trim();

  const result = await executeAIRequest({
    prompt: userPrompt,
    systemPrompt,
    responseSchema: NoteSummarySchema,
    requestType: "summary",
    userId: user.id,
  });

  if (result.success && result.data) {
    return NextResponse.json({ success: true, summary: result.data });
  }

  return NextResponse.json({
    success: true,
    fallbackUsed: true,
    summary: {
      summary: content.slice(0, 300) + "...",
      keyPoints: ["Catatan berhasil disimpan."],
      legalTerms: [],
      reviewQuestions: ["Jelaskan kembali poin utama dari materi ini dengan kalimat Anda sendiri."],
    },
  });
}
