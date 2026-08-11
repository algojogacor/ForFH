import { PasalSearchResponse, PasalLawDetail } from "./types";
import { logger } from "../logger";

const BASE_URL = process.env.PASAL_API_BASE_URL || "https://pasal.id/api/v1";
const isProduction = process.env.NODE_ENV === "production";

// Demo/mock legal repository strictly for LOCAL DEVELOPMENT ONLY
const DEV_MOCK_LAWS: Record<string, PasalLawDetail> = {
  "akn/id/act/uu/2023/1": {
    frbr_uri: "akn/id/act/uu/2023/1",
    title: "[DEMO] Undang-Undang Nomor 1 Tahun 2023 tentang Kitab Undang-Undang Hukum Pidana (KUHP Baru)",
    type: "UU",
    number: "1",
    year: "2023",
    status: "berlaku",
    content_verified: true,
    articles: [
      {
        number: "1",
        content: "Tidak ada satu perbuatan pun yang dapat dikenai sanksi pidana dan/atau tindakan, kecuali atas kekuatan peraturan perundang-undangan pidana yang telah ada sebelum perbuatan dilakukan (Asas Legalitas).",
        explanation: "Ayat ini menegaskan asas legalitas materiil dan formil dalam hukum pidana nasional.",
      },
      {
        number: "2",
        content: "Ketentuan sebagaimana dimaksud dalam Pasal 1 ayat (1) tidak mengurangi berlakunya hukum yang hidup dalam masyarakat yang menentukan bahwa seseorang patut dipidana walaupun perbuatan tersebut tidak diatur dalam Undang-Undang ini.",
        explanation: "Mengakui keberlakuan hukum adat / the living law sepanjang sesuai dengan Pancasila dan HAM.",
      },
    ],
  },
  "akn/id/act/kuhperdata": {
    frbr_uri: "akn/id/act/kuhperdata",
    title: "[DEMO] Kitab Undang-Undang Hukum Perdata (Burgerlijk Wetboek)",
    type: "KUHPERDATA",
    number: "-",
    year: "1847",
    status: "berlaku",
    content_verified: true,
    articles: [
      {
        number: "1320",
        content: "Supaya terjadi persetujuan yang sah, perlu dipenuhi empat syarat: 1. kesepakatan mereka yang mengikatkan dirinya; 2. kecakapan untuk membuat suatu perikatan; 3. suatu pokok persoalan tertentu; 4. suatu sebab yang tidak terlarang.",
        explanation: "Syarat 1 dan 2 adalah syarat subjektif (dapat dibatalkan), sedangkan syarat 3 dan 4 adalah syarat objektif (batal demi hukum).",
      },
      {
        number: "1338",
        content: "Semua persetujuan yang dibuat secara sah berlaku sebagai undang-undang bagi mereka yang membuatnya (Pacta Sunt Servanda). Persetujuan tidak dapat ditarik kembali selain dengan kesepakatan kedua belah pihak, atau karena alasan-alasan yang ditentukan oleh undang-undang. Persetujuan harus dilaksanakan dengan iktikad baik.",
        explanation: "Asas kebebasan berkontrak, kepastian hukum, dan asas iktikad baik dalam hukum perjanjian.",
      },
      {
        number: "1365",
        content: "Tiap perbuatan yang melanggar hukum dan membawa kerugian kepada orang lain, mewajibkan orang yang menimbulkan kerugian karena kesalahannya untuk mengganti kerugian tersebut (Onrechtmatige Daad).",
        explanation: "Ketentuan dasar pertanggungjawaban perbuatan melawan hukum (PMH).",
      },
    ],
  },
};

/**
 * Clean and normalize FRBR URI (strip duplicate leading slashes)
 */
export function normalizeFrbrUri(uri: string): string {
  return uri.replace(/^\/+/, "").trim();
}

/**
 * Searches laws on Pasal.id REST API
 */
export async function searchPasalLaws(params: {
  q: string;
  type?: string;
  limit?: number;
}): Promise<PasalSearchResponse & { error?: string }> {
  const token = process.env.PASAL_API_TOKEN;
  const limit = Math.min(params.limit || 10, 20);

  if (!token) {
    if (isProduction) {
      logger.warn("PASAL_API_TOKEN is not configured in production.");
      return {
        total: 0,
        results: [],
        error: "Data hukum sedang tidak dapat diambil.",
      };
    }
    // Local dev mock search
    return searchDevMockLaws(params.q, params.type, limit);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const url = new URL(`${BASE_URL}/search`);
    url.searchParams.set("q", params.q);
    if (params.type && params.type !== "ALL") {
      url.searchParams.set("type", params.type);
    }
    url.searchParams.set("limit", limit.toString());

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const raw = await res.json();
      const rawResults = raw.results || [];
      const formattedResults = rawResults.map((item: any) => {
        const w = item.work || {};
        return {
          frbr_uri: item.frbr_uri || w.frbr_uri || `work_${item.work_id || Date.now()}`,
          title: item.title || w.title || w.name || "Peraturan Tanpa Judul",
          type: item.type || w.type || w.category || "UU",
          number: item.number || w.number || "",
          year: item.year || w.year || "",
          status: item.status || w.status || "berlaku",
          content_verified: item.content_verified ?? w.content_verified ?? true,
          snippet: item.snippet || (item.matching_pasals ? `Ketentuan pada: ${item.matching_pasals}` : undefined),
        };
      });

      return {
        total: raw.total || formattedResults.length,
        results: formattedResults,
      };
    }

    logger.warn(`Pasal.id search returned HTTP status: ${res.status}`);
    if (isProduction) {
      return {
        total: 0,
        results: [],
        error: "Data hukum sedang tidak dapat diambil.",
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    logger.error("Pasal.id search request failed:", err?.message || "Network error");
    if (isProduction) {
      return {
        total: 0,
        results: [],
        error: "Data hukum sedang tidak dapat diambil.",
      };
    }
  }

  // Development-only fallback
  return searchDevMockLaws(params.q, params.type, limit);
}

function searchDevMockLaws(q: string, type?: string, limit: number = 10): PasalSearchResponse {
  const queryLower = q.toLowerCase();
  const matched = Object.values(DEV_MOCK_LAWS).filter((law) => {
    const matchesType = !type || type === "ALL" || law.type === type;
    const matchesText =
      law.title.toLowerCase().includes(queryLower) ||
      law.articles.some(
        (a) => a.content.toLowerCase().includes(queryLower) || a.number.includes(queryLower)
      );
    return matchesType && matchesText;
  });

  return {
    total: matched.length,
    results: matched.slice(0, limit).map((law) => ({
      frbr_uri: law.frbr_uri,
      title: law.title,
      type: law.type,
      number: law.number,
      year: law.year,
      status: law.status,
      content_verified: law.content_verified,
      snippet: law.articles[0]?.content.slice(0, 180) + "...",
      matched_articles: law.articles.slice(0, 2).map((a) => ({
        article_number: a.number,
        snippet: a.content,
      })),
    })),
  };
}

/**
 * Retrieves single law details by FRBR URI from Pasal.id
 */
export async function getPasalLawDetail(rawUri: string): Promise<PasalLawDetail | null> {
  const uri = normalizeFrbrUri(rawUri);
  const token = process.env.PASAL_API_TOKEN;

  if (!token) {
    if (isProduction) {
      logger.warn("PASAL_API_TOKEN is not configured in production.");
      return null;
    }
    return DEV_MOCK_LAWS[uri] || null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const url = `${BASE_URL}/laws/${uri}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
    logger.warn(`Pasal.id detail returned HTTP status ${res.status} for URI: ${uri}`);
  } catch (err: any) {
    clearTimeout(timeoutId);
    logger.error("Pasal.id detail request failed:", err?.message || "Network error");
  }

  if (isProduction) {
    return null;
  }

  // Development-only fallback
  return DEV_MOCK_LAWS[uri] || null;
}
