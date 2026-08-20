// Client server-side untuk HE-BAT (Moodle UNAIR).
// Jalur tanpa sesi permanen: login form SEKALI saat connect untuk mengambil
// authtoken kalender (dari /calendar/export.php), lalu simpan authtoken itu
// terenkripsi — semua sync berikutnya pakai authtoken (tanpa password,
// tanpa sesi). Form login Moodle standar (logintoken CSRF), bukan SSO.
import { logger } from "@/lib/logger";
import { parseCoursePage } from "./mappings";
import type { HebatCourseInstructions } from "./mappings";

// Jenis struktur crawl instruksi dipakai juga di sini (lihat mappings.ts).
export type { HebatCourseInstructions, HebatSection } from "./mappings";

const BASE = "https://hebat.elearning.unair.ac.id";
const UA = "forfh-sync/1.0 (Mozilla/5.0 compatible)";
const TIMEOUT_MS = 15000;
const TIMEOUT_COURSE_MS = 10000; // halaman kursus saat crawl instruksi (banyak halaman)
const MAX_REDIRECTS = 5;
// Batas crawl instruksi saat connect: cap jumlah kursus + deadline total —
// platform serverless bisa mati di tengah (authtoken sudah tersimpan lebih dulu).
const CRAWL_COURSE_CAP = 30;
const CRAWL_DEADLINE_MS = 40000;

export class HebatError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HebatError";
    this.status = status;
  }
}

// --- cookie jar manual (fetch Node tidak mengelola cookie antar-redirect) ---
class CookieJar {
  private map = new Map<string, string>();
  absorb(setCookie: string | null | undefined) {
    if (!setCookie) return;
    for (const part of setCookie.split(",")) {
      const m = part.match(/^\s*([^=;]+)=([^;]*)/);
      if (m) this.map.set(m[1].trim(), m[2]);
    }
  }
  // Lanjutkan sesi dari header cookie ("k=v; k2=v2") — dipakai untuk crawl
  // instruksi dengan sesi connect yang masih hidup. Hanya di memory.
  seed(header: string) {
    if (!header) return;
    for (const part of header.split(";")) {
      const m = part.match(/^\s*([^=]+)=([^;]*)/);
      if (m) this.map.set(m[1].trim(), m[2]);
    }
  }
  header(): string {
    return Array.from(this.map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get count(): number {
    return this.map.size;
  }
}

async function hop(url: string, init: RequestInit, jar: CookieJar, depth: number, timeoutMs: number = TIMEOUT_MS): Promise<{ status: number; text: string; url: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { "User-Agent": UA };
  if (jar.count > 0) headers.Cookie = jar.header();
  if (init.headers) Object.assign(headers, init.headers);
  let r: Response;
  try {
    r = await fetch(url, { ...init, headers, redirect: "manual", signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new HebatError(0, "HE-BAT tidak merespons (timeout).");
    throw new HebatError(0, "Gagal menghubungi HE-BAT: " + (e?.message || "jaringan"));
  } finally {
    clearTimeout(timeoutId);
  }
  jar.absorb(r.headers.get("set-cookie"));
  const status = r.status;
  if (status >= 301 && status <= 308 && status !== 304) {
    const loc = r.headers.get("location");
    if (!loc) return { status, text: "", url };
    if (depth >= MAX_REDIRECTS) throw new HebatError(0, "HE-BAT: terlalu banyak redirect.");
    return hop(new URL(loc, url).toString(), { method: "GET" }, jar, depth + 1, timeoutMs);
  }
  return { status, text: await r.text(), url };
}

function htmlAttr(html: string, name: string): string {
  // value dari <input ... name="logintoken" value="..."> — tanpa regex escape
  const idx = html.indexOf('name="' + name + '"');
  if (idx < 0) return "";
  const rest = html.slice(idx + name.length + 8);
  const vi = rest.indexOf('value="');
  if (vi < 0) return "";
  const v = rest.slice(vi + 7);
  return v.slice(0, v.indexOf('"'));
}

export interface HebatConnect {
  userid: string;
  authtoken: string;
  // Cookie sesi Moodle aktif (MoodleSession+MOODLEID1_) — memory-only, TIDAK
  // pernah disimpan/di-log/di-return ke client. Dipakai crawl instruksi saat
  // connect, lalu dibuang.
  sessionCookie?: string;
}

// Login form HE-BAT (NIM + password), lalu ambil authtoken kalender dari
// halaman export. Dipakai sekali saat connect; hasilnya disimpan terenkripsi.
export async function connectHebat(nim: string, password: string): Promise<HebatConnect> {
  const jar = new CookieJar();
  if (!nim || !password) throw new HebatError(400, "NIM dan password HE-BAT wajib diisi.");

  // 1. Halaman login -> logintoken (CSRF) + MoodleSession awal
  const lp = await hop(BASE + "/login/index.php", { method: "GET" }, jar, 0);
  if (lp.status !== 200) throw new HebatError(lp.status, "HE-BAT: halaman login tidak dapat diakses (HTTP " + lp.status + ").");
  const logintoken = htmlAttr(lp.text, "logintoken");
  if (!logintoken) throw new HebatError(0, "HE-BAT: logintoken tidak ditemukan di halaman login.");

  // 2. POST kredensial -> redirect ke /my/ (sesi aktif)
  const body = new URLSearchParams({ username: nim, password, logintoken, anchor: "" }).toString();
  const lg = await hop(BASE + "/login/index.php", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, jar, 0);
  if (lg.status !== 200) throw new HebatError(lg.status, "HE-BAT: login gagal (HTTP " + lg.status + ").");

  // 3. Buka halaman export -> cek sesi aktif + ambil sesskey
  const ex = await hop(BASE + "/calendar/export.php", { method: "GET" }, jar, 0);
  if (ex.status !== 200) throw new HebatError(ex.status, "HE-BAT: halaman kalender tidak dapat diakses (HTTP " + ex.status + ").");
  const sesskey = htmlAttr(ex.text, "sesskey");
  if (!sesskey) {
    // Kemungkinan masih di halaman login (password salah) atau sesi gagal
    if (ex.text.includes("logintoken")) throw new HebatError(401, "NIM atau password HE-BAT salah.");
    throw new HebatError(0, "HE-BAT: gagal masuk ke halaman kalender.");
  }

  // 4. Submit form "Get calendar URL" -> input #calendarexporturl berisi URL
  const gen = new URLSearchParams({
    sesskey,
    "_qf__core_calendar_export_form": "1",
    "events[exportevents]": "all",
    "period[timeperiod]": "custom",
    generateurl: "1",
  }).toString();
  const g = await hop(BASE + "/calendar/export.php", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: gen }, jar, 0);
  if (g.status !== 200) throw new HebatError(g.status, "HE-BAT: gagal membuat URL kalender (HTTP " + g.status + ").");
  const iu = g.text.indexOf('id="calendarexporturl"');
  if (iu < 0) throw new HebatError(0, "HE-BAT: URL kalender tidak muncul di halaman export.");
  const rest = g.text.slice(iu + 'id="calendarexporturl"'.length);
  const vi = rest.indexOf('value="');
  if (vi < 0) throw new HebatError(0, "HE-BAT: URL kalender tidak ditemukan.");
  const url = rest.slice(vi + 7, rest.indexOf('"', vi + 7));

  const userid = /userid=(\d+)/.exec(url)?.[1] || "";
  const authtoken = /authtoken=([A-Za-z0-9]+)/.exec(url)?.[1] || "";
  if (!userid || !authtoken) throw new HebatError(0, "HE-BAT: userid/authtoken tidak ada di URL kalender.");
  return { userid, authtoken, sessionCookie: jar.header() };
}

// Fetch feed iCal tanpa sesi (authtoken cukup). Rentang: 90 hari ke belakang,
// ~400 hari ke depan (satu semester penuh).
export async function fetchIcs(userid: string, authtoken: string): Promise<string> {
  const start = Math.floor(Date.now() / 1000) - 90 * 86400;
  const end = start + 490 * 86400;
  const u = `${BASE}/calendar/export_execute.php?userid=${encodeURIComponent(userid)}&authtoken=${encodeURIComponent(authtoken)}&preset_what=all&preset_time=custom&starttime=${start}&endtime=${end}`;

  let lastErr: any = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 250, 4000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, signal: controller.signal });
      if (!r.ok) {
        if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < 2) {
          lastErr = new HebatError(r.status, "Feed HE-BAT: HTTP " + r.status);
          continue;
        }
        throw new HebatError(r.status, "Feed HE-BAT: HTTP " + r.status + " (authtoken tidak valid? hubungkan ulang di Pengaturan).");
      }
      return await r.text();
    } catch (e: any) {
      if (e instanceof HebatError && e.status !== 502 && e.status !== 503 && e.status !== 504 && e.status !== 0) {
        throw e;
      }
      lastErr = e;
      if (attempt < 2) continue;
      if (e instanceof HebatError) throw e;
      if (e?.name === "AbortError") throw new HebatError(0, "HE-BAT tidak merespons (timeout).");
      throw new HebatError(0, "Gagal mengambil kalender HE-BAT: " + (e?.message || "jaringan"));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  if (lastErr instanceof HebatError) throw lastErr;
  throw new HebatError(0, "Gagal mengambil kalender HE-BAT: " + (lastErr?.message || "jaringan"));
}

export interface IcsEvent {
  SUMMARY?: string;
  DESCRIPTION?: string;
  DTSTART?: string;
  DTEND?: string;
  CATEGORIES?: string;
  UID?: string;
  [key: string]: string | undefined;
}

// Parse iCal sederhana (salinan logika api/moodle-cal.js kk_lite — terverifikasi).
export function parseIcs(t: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let cur: IcsEvent | null = null;
  let last = "";
  const keys = ["SUMMARY", "DESCRIPTION", "DTSTART", "DTEND", "CATEGORIES", "UID"];
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, "");
    const m = line.match(/^([A-Z-]+);?[^:]*:(.*)$/);
    if (!m) {
      if (cur && last && /^[ \t]/.test(line)) cur[last] = (cur[last] || "") + line.trim();
      continue;
    }
    const k = m[1];
    const v = m[2];
    if (k === "BEGIN") cur = {};
    else if (k === "END") {
      if (cur) events.push(cur);
      cur = null;
      last = "";
    } else if (cur && keys.includes(k)) {
      cur[k] = v;
      last = k;
    }
  }
  return events;
}

// Moodle soft-redirect ke login mengembalikan HTTP 200 — deteksi lewat URL
// final (hop sudah mengikuti redirect) sebagai sinyal PRIMER; substring
// "logintoken" di body sekunder (halaman valid bisa memuatnya di JS/config —
// false-positive kalau dipakai sendirian).
export function assertCalendarSessionAlive(r: { url: string; text: string }): void {
  if (r.url.includes("/login/index.php") || r.text.includes("logintoken")) {
    throw new HebatError(401, "Sesi HE-BAT berakhir — hubungkan ulang HE-BAT.");
  }
}

// Kumpulkan hasil allSettled halaman kursus:
//  - fulfilled dengan sections KOSONG = soft-redirect ke login (HTTP 200) atau
//    HTML rusak — SKIP. Halaman kursus Moodle asli SELALU punya minimal
//    section 0; entri kosong di-upsert hanya akan MENIMPA instruksi yang
//    sudah bagus.
//  - rejection 401 (URL login / logintoken) = sesi mati di tengah crawl —
//    lempar, bukan warn: hentikan crawl supaya pengguna disuruh hubungkan ulang.
//  - rejection lain = kursus gagal diambil — skip dengan warn.
export function collectCrawlResults(results: PromiseSettledResult<HebatCourseInstructions>[]): HebatCourseInstructions[] {
  const out: HebatCourseInstructions[] = [];
  for (const res of results) {
    if (res.status === "fulfilled") {
      if (res.value.sections.length === 0) {
        logger.warn("HE-BAT: halaman kursus tanpa section (sesi mati / soft-redirect ke login?) — dilewati");
        continue;
      }
      out.push(res.value);
    } else if ((res.reason as HebatError)?.status === 401) {
      throw res.reason;
    } else {
      logger.warn(`HE-BAT: instruksi kursus gagal diambil: ${(res.reason as Error)?.message || res.reason}`);
    }
  }
  return out;
}

// Crawl instruksi tugas saat connect: ambil course id user dari halaman
// kalender (upcoming + month, dedupe), lalu halaman tiap kursus untuk section
// summary. Sesi dipakai via sessionCookie (memory-only). Kursus yang gagal
// di-skip (bukan menggagalkan crawl); throw hanya kalau halaman kalender
// tidak bisa diambil. Batasi concurrency ~4, timeout per request 10s, cap
// jumlah kursus — plus deadline total: kalau kalah, throw (connect tetap
// sukses; authtoken sudah tersimpan oleh pemanggil).
export async function fetchCourseInstructions(sessionCookie: string): Promise<HebatCourseInstructions[]> {
  let deadlineId: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false; // dipakai crawlInstructions: stop di sela batch saat deadline menang
  const deadline = new Promise<never>((_, reject) => {
    deadlineId = setTimeout(
      () => {
        cancelled = true;
        reject(new HebatError(0, "HE-BAT: waktu pengambilan instruksi habis."));
      },
      CRAWL_DEADLINE_MS
    );
  });
  try {
    return await Promise.race([crawlInstructions(sessionCookie, () => cancelled), deadline]);
  } finally {
    clearTimeout(deadlineId); // timer selalu dibersihkan, menang atau kalah
  }
}

async function crawlInstructions(sessionCookie: string, isCancelled: () => boolean = () => false): Promise<HebatCourseInstructions[]> {
  const jar = new CookieJar();
  jar.seed(sessionCookie);

  // 1. Kumpulkan course id dari kalender (upcoming + month) — dedupe.
  const courseIds = new Set<string>();
  for (const view of [
    "view=upcoming",
    `view=month&time=${Math.floor(Date.now() / 1000)}`,
  ]) {
    const r = await hop(`${BASE}/calendar/view.php?${view}`, { method: "GET" }, jar, 0);
    if (r.status !== 200) {
      throw new HebatError(r.status, `HE-BAT: halaman kalender tidak dapat diakses (HTTP ${r.status}).`);
    }
    // Soft-redirect ke login = sesi mati — jangan sampai courseIds kosong
    // menimpa instruksi yang sudah bagus.
    assertCalendarSessionAlive(r);
    for (const m of r.text.matchAll(/course\/view\.php\?id=(\d+)/g)) courseIds.add(m[1]);
  }

  // Cap jumlah kursus — jaga total waktu crawl tetap terkendali.
  let ids = Array.from(courseIds);
  if (ids.length > CRAWL_COURSE_CAP) {
    logger.warn(`HE-BAT: ${ids.length} kursus, hanya ${CRAWL_COURSE_CAP} pertama yang di-crawl`);
    ids = ids.slice(0, CRAWL_COURSE_CAP);
  }

  // 2. Ambil halaman tiap kursus — paralel dengan batas concurrency ~4.
  const instructions: HebatCourseInstructions[] = [];
  for (let i = 0; i < ids.length; i += 4) {
    if (isCancelled()) break; // deadline menang — hentikan tanpa request sia-sia
    const results = await Promise.allSettled(ids.slice(i, i + 4).map(async (id) => {
      const r = await hop(`${BASE}/course/view.php?id=${id}`, { method: "GET" }, jar, 0, TIMEOUT_COURSE_MS);
      // Soft-redirect ke login juga bisa terjadi per halaman kursus (HTTP 200)
      assertCalendarSessionAlive(r);
      if (r.status !== 200) throw new HebatError(r.status, `kursus HTTP ${r.status}`);
      return parseCoursePage(r.text, id);
    }));
    instructions.push(...collectCrawlResults(results));
  }
  return instructions;
}
