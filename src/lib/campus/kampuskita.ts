// Client server-side untuk API Kampus Kita UNAIR.
// Pola kredensial: email kampus + password PLAINTEXT (bukan NIM) -> JWT lewat
// header Set-Cookie (HttpOnly, domain=localhost — bug config UNAIR), berlaku
// ~1 tahun. Endpoint lain: Authorization: Bearer + ?token= query.
// Semua fetch memakai AbortController timeout (pola pasal-client). Token TIDAK
// pernah di-log; password TIDAK pernah disimpan di mana pun.
import { rowsFrom, pick } from "./rows";

const BASE = "https://apikampuskita-mahasiswa.unair.ac.id";
const UA = "Dart/3.3 (dart:io)";
const TIMEOUT_MS = 15000;

export interface CampusLogin {
  jwt: string;
  payload: JwtPayload;
  nim: string; // dari payload.username (JWT berisi NIM sebagai username)
}

export interface JwtPayload {
  IDMhs?: string;
  IDPengguna?: number;
  exp?: number;
  username?: string;
}

export class KampusKitaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "KampusKitaError";
    this.status = status;
  }
}

function decodeJwt(jwt: string): JwtPayload {
  const parts = jwt.split(".");
  if (parts.length < 2) return {};
  try {
    const mid = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    return JSON.parse(Buffer.from(mid, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

async function kkFetch(path: string, opts: { method: string; token?: string; params?: Record<string, string>; body?: Record<string, string> }): Promise<{ status: number; text: string; setCookie: string }> {
  const url = new URL(BASE + path);
  if (opts.token) {
    url.searchParams.set("token", opts.token);
    for (const [k, v] of Object.entries(opts.params || {})) url.searchParams.set(k, v);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { "User-Agent": UA };
  if (opts.token) headers.Authorization = "Bearer " + opts.token;
  let body: string | undefined;
  if (opts.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.body).toString();
  }
  try {
    const r = await fetch(url.toString(), { method: opts.method, headers, body, signal: controller.signal, redirect: "manual" });
    return { status: r.status, text: await r.text(), setCookie: r.headers.get("set-cookie") || "" };
  } catch (e: any) {
    if (e?.name === "AbortError") throw new KampusKitaError(0, "Server UNAIR tidak merespons (timeout).");
    throw new KampusKitaError(0, "Gagal menghubungi server UNAIR: " + (e?.message || "jaringan"));
  } finally {
    clearTimeout(timeoutId);
  }
}

// Login dengan email kampus + password -> JWT. Dipakai SEKALI saat login
// ForFH; hasilnya (JWT) disimpan terenkripsi, password dibuang.
export async function loginCampus(email: string, password: string): Promise<CampusLogin> {
  if (!email || !password) throw new KampusKitaError(400, "Email dan password wajib diisi.");
  const { status, text, setCookie } = await kkFetch("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const m = setCookie.match(/token=([^;]+)/);
  const jwt = m ? m[1] : "";
  if (jwt) {
    const payload = decodeJwt(jwt);
    return { jwt, payload, nim: payload.username || "" };
  }
  let msg = "Login kampus gagal (HTTP " + status + ").";
  try {
    const j = JSON.parse(text);
    if (j && j.message) msg = String(j.message);
  } catch {
    /* body bukan json */
  }
  // 401/404/422 semuanya dikembalikan sebagai 401 generik:
  // 404 ("username is not exist") tidak boleh membocorkan keberadaan email.
  if (status === 401 || status === 404 || status === 422) {
    msg = "Email atau password salah. Pastikan email memakai @student.unair.ac.id.";
    throw new KampusKitaError(401, msg);
  }
  throw new KampusKitaError(status || 401, msg);
}

export class KampusKitaClient {
  constructor(private jwt: string) {}

  private async get(path: string, params?: Record<string, string>) {
    const { status, text } = await kkFetch(path, { method: "GET", token: this.jwt, params });
    if (status === 401) throw new KampusKitaError(401, "Sesi Kampus Kita kedaluwarsa. Silakan login ulang.");
    if (status !== 200) throw new KampusKitaError(status, "Kampus Kita: HTTP " + status + " untuk " + path);
    let j: unknown;
    try {
      j = JSON.parse(text);
    } catch {
      throw new KampusKitaError(status, "Kampus Kita: respons tidak valid untuk " + path);
    }
    return j;
  }

  private async post(path: string, params?: Record<string, string>) {
    const { status, text } = await kkFetch(path, { method: "POST", token: this.jwt, params });
    if (status === 401) throw new KampusKitaError(401, "Sesi Kampus Kita kedaluwarsa. Silakan login ulang.");
    if (status !== 200) throw new KampusKitaError(status, "Kampus Kita: HTTP " + status + " untuk " + path);
    try {
      return JSON.parse(text);
    } catch {
      throw new KampusKitaError(status, "Kampus Kita: respons tidak valid untuk " + path);
    }
  }

  // Jadwal kuliah semester berjalan: POST, bentuk [{"Senin":[...]}, ...]
  async jadwal(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.post("/akademik/jadwal-kuliah"));
  }

  // Presensi per MK: hadir/total minggu + persen
  async presensi(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/kemahasiswaan/presensi-kuliah"));
  }

  // Daftar semester KHS: [{ID_SEMESTER, TAHUN_AJARAN, NM_SEMESTER}, ...]
  async semesters(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/akademik/semester-khs"));
  }

  // Riwayat KHS per semester (butuh id semester dari semesters())
  async khs(semesterId: string): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.post("/kemahasiswaan/riwayat-khs", { semester: semesterId }));
  }

  // Profil mahasiswa: NIM_MHS, NM_PENGGUNA, NM_PROGRAM_STUDI, dsb.
  async status(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/akademik/status-mhs"));
  }

  // Mata kuliah semester ini (kode, nama, SKS, kelas, dosen)
  async pesertaMataKuliah(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/akademik/peserta-mata-kuliah"));
  }

  // Kalender akademik (tanggal penting semester)
  async kalenderAkademik(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/akademik/kalender-akademik"));
  }

  // Riwayat pembayaran (tagihan & status bayar)
  async pembayaran(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/kemahasiswaan/pembayaran"));
  }

  // Dosen wali semester berjalan
  async dosenWali(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/akademik/dosen-wali"));
  }

  // Masa studi (mulai, batas, sisa semester)
  async masaStudi(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/akademik/masa-studi"));
  }

  // SKS aktif semester berjalan
  async sksAktif(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/akademik/sks-aktif"));
  }

  // Riwayat HER (nilai perbaikan)
  async histHer(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/kemahasiswaan/hist-her"));
  }

  // Riwayat penyerahan KTM
  async penyerahanKtm(): Promise<Record<string, unknown>[]> {
    return rowsFrom(await this.get("/kemahasiswaan/penyerahan-ktm"));
  }
}
