// Client server-side untuk HE-BAT (Moodle UNAIR).
// Jalur tanpa sesi permanen: login form SEKALI saat connect untuk mengambil
// authtoken kalender (dari /calendar/export.php), lalu simpan authtoken itu
// terenkripsi — semua sync berikutnya pakai authtoken (tanpa password,
// tanpa sesi). Form login Moodle standar (logintoken CSRF), bukan SSO.
const BASE = "https://hebat.elearning.unair.ac.id";
const UA = "forfh-sync/1.0 (Mozilla/5.0 compatible)";
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;

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
  header(): string {
    return Array.from(this.map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get count(): number {
    return this.map.size;
  }
}

async function hop(url: string, init: RequestInit, jar: CookieJar, depth: number): Promise<{ status: number; text: string; url: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
    return hop(new URL(loc, url).toString(), { method: "GET" }, jar, depth + 1);
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
  return { userid, authtoken };
}

// Fetch feed iCal tanpa sesi (authtoken cukup). Rentang: 90 hari ke belakang,
// ~400 hari ke depan (satu semester penuh).
export async function fetchIcs(userid: string, authtoken: string): Promise<string> {
  const start = Math.floor(Date.now() / 1000) - 90 * 86400;
  const end = start + 490 * 86400;
  const u = `${BASE}/calendar/export_execute.php?userid=${encodeURIComponent(userid)}&authtoken=${encodeURIComponent(authtoken)}&preset_what=all&preset_time=custom&starttime=${start}&endtime=${end}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!r.ok) throw new HebatError(r.status, "Feed HE-BAT: HTTP " + r.status + " (authtoken tidak valid? hubungkan ulang di Pengaturan).");
    return await r.text();
  } catch (e: any) {
    if (e instanceof HebatError) throw e;
    throw new HebatError(0, "Gagal mengambil kalender HE-BAT: " + (e?.message || "jaringan"));
  } finally {
    clearTimeout(timeoutId);
  }
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
