import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { executeAIRequest } from "@/lib/ai/router";
import { getCachedAI, setCachedAI } from "@/lib/ai/cache";
import { LegalExplainerSchema } from "@/lib/ai/schemas";
import { LEGAL_EXPLAINER_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { getPasalLawDetail } from "@/lib/legal/pasal-client";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { frbrUri, lawTitle, lawContent, specificQuestion } = body;

  let regulationText = lawContent || "";
  let title = lawTitle || "";

  // If FRBR URI provided, fetch live details
  if (frbrUri && !regulationText) {
    const detail = await getPasalLawDetail(frbrUri);
    if (detail) {
      title = detail.title;
      regulationText = detail.articles
        .map((a) => `Pasal ${a.number}:\n${a.content}\n${a.explanation ? `Penjelasan: ${a.explanation}` : ""}`)
        .join("\n\n");
    }
  }

  if (!regulationText) {
    return NextResponse.json({ error: "Teks pasal atau peraturan tidak ditemukan." }, { status: 400 });
  }

  // Cache per pertanyaan: deterministik (teks pasal + pertanyaan sama → jawaban sama)
  const cacheKey = crypto
    .createHash("sha256")
    .update(`${title}|${regulationText}|${specificQuestion || ""}`)
    .digest("hex")
    .slice(0, 64);
  const cached = await getCachedAI(user.id, "explain_law", cacheKey);
  if (cached) {
    return NextResponse.json({ success: true, explanation: cached, cached: true });
  }

  const systemPrompt = LEGAL_EXPLAINER_SYSTEM_PROMPT.replace("{{REGULATION_CONTENT}}", regulationText);
  const userPrompt = `
Peraturan: ${title}
${specificQuestion ? `Pertanyaan Khusus Mahasiswa: ${specificQuestion}` : "Jelaskan pasal-pasal di atas, unsur-unsurnya, dan konteks penerapannya dalam studi kasus hukum."}
`.trim();

  const result = await executeAIRequest({
    prompt: userPrompt,
    systemPrompt,
    responseSchema: LegalExplainerSchema,
    requestType: "legal_explain",
    userId: user.id,
  });

  if (result.success && result.data) {
    if (!result.fallbackUsed) {
      await setCachedAI(user.id, "explain_law", cacheKey, result.data, 24 * 60 * 60 * 1000);
    }
    return NextResponse.json({ success: true, explanation: result.data });
  }

  return NextResponse.json({
    success: true,
    fallbackUsed: true,
    explanation: {
      regulationTitle: title || "Peraturan Perundang-undangan",
      summary: "Peraturan ini mengatur ketentuan normatif yang berlaku. Silakan periksa rumusan pasal asli untuk telaah mendalam.",
      articleBreakdown: [
        {
          articleNumber: "Pasal Terkait",
          explanation: regulationText.slice(0, 300) + "...",
          practicalContext: "Diterapkan sesuai kasus perikatan atau pertanggungjawaban hukum terkait.",
        },
      ],
      keyTakeaway: "Pahami asas dan norma yang mendasari pasal tersebut.",
      disclaimer: "Penjelasan ini ditujukan untuk tujuan edukasi mahasiswa hukum.",
    },
  });
}
