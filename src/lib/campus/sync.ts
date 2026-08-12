// Engine sinkronisasi kampus: jalankan per-user, isi courses / class_schedules /
// tasks / grades dari Kampus Kita + HE-BAT (iCal). Idempoten — tiap entitas
// di-upsert by external_id, jadi aman dijalankan ulang.
//
// Cakupan:
//  - courses + class_schedules : /akademik/jadwal-kuliah (KK)
//  - grades                     : /akademik/semester-khs + /kemahasiswaan/riwayat-khs (KK)
//  - tasks                      : feed iCal HE-BAT (authtoken, tanpa sesi)
//  - campus_data                : rekap presensi (agregat per MK) + info kampus
//    (pembayaran, dosen wali, masa studi, SKS, HER, KTM, kalender akademik).
//    Presensi TIDAK dipetakan ke baris attendance — datanya agregat tanpa
//    tanggal, catatan per tanggal tetap manual.
//
// Token dienkripsi at-rest (AES-256-GCM, kunci dari SESSION_SECRET) — lihat
// src/lib/crypto/at-rest.ts. Password tidak pernah tersimpan.
import { and, eq, lt, or, isNull } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import {
  campusAccounts,
  campusData,
  classSchedules,
  courses,
  grades,
  notificationDeliveries,
  tasks,
  userSettings,
} from "@/lib/db";
import type { CampusDataJenis } from "@/lib/db";
import { logger } from "@/lib/logger";
import { decryptText, encryptText } from "@/lib/crypto/at-rest";
import { sendPushToUser } from "@/lib/notifications/web-push";
import { KampusKitaClient } from "./kampuskita";
import { fetchIcs, parseIcs } from "./hebat";
import { jadwalToSchedules, khsToGrades, icsToTask, presensiToRecap } from "./mappings";

const SYNC_INTERVAL_MIN = Number(process.env.FORFH_SYNC_INTERVAL_MIN || 30);
const MAX_KHS_SEMESTERS = 6;

export interface CampusSyncSummary {
  skipped: boolean;
  courses: number;
  schedules: number;
  tasks: number;
  newTasks: number;
  grades: number;
  campusData: number; // jumlah jenis info kampus/rekap yang berhasil di-update
}

// Tabel sasaran memakai kolom bersama user_id / external_id / id / updated_at.
type SyncTable = SQLiteTable & { userId: any; externalId: any; id: any; updatedAt?: any };

// Helper upsert: cari by (user_id, external_id) -> update | insert
async function upsertByExternal<T extends { id: string }>(
  table: SyncTable,
  userId: string,
  externalId: string,
  values: Record<string, unknown>
): Promise<T> {
  const existing = await db.select().from(table).where(
    and(eq(table.userId, userId), eq(table.externalId, externalId))
  ).limit(1).then((rows) => rows[0]);
  if (existing) {
    await db.update(table).set({ ...values, updatedAt: new Date() }).where(eq(table.id, existing.id));
    return existing as T;
  }
  const id = crypto.randomUUID();
  await db.insert(table as any).values({ id, userId, externalId, ...values });
  return ({ ...values, id } as unknown) as T;
}

// campusData tidak punya external_id — upsert by (user_id, jenis).
// Tetap dijalankan saat rows kosong ([]) agar UI bisa membedakan
// "sudah sync tapi kosong" vs "belum pernah sync".
async function upsertCampusData(userId: string, jenis: CampusDataJenis, rows: unknown[]): Promise<void> {
  const existing = await db.select().from(campusData).where(
    and(eq(campusData.userId, userId), eq(campusData.jenis, jenis))
  ).limit(1).then((rows_) => rows_[0]);
  const dataJson = JSON.stringify(rows);
  if (existing) {
    await db.update(campusData).set({ dataJson, updatedAt: new Date() }).where(eq(campusData.id, existing.id));
  } else {
    await db.insert(campusData).values({ id: crypto.randomUUID(), userId, jenis, dataJson });
  }
}

async function findAccount(userId: string) {
  const acc = await db.query.campusAccounts.findFirst({
    where: eq(campusAccounts.userId, userId),
  });
  return acc;
}

/**
 * Jalankan sinkronisasi untuk satu user. Melempar error jika gagal total;
 * state terakhir (last_sync_status/error/summary) di-update di akhir.
 */
export async function runCampusSync(userId: string, opts: { force?: boolean } = {}): Promise<CampusSyncSummary> {
  const acc = await findAccount(userId);
  if (!acc) throw new Error("Akun kampus belum terhubung.");

  // Throttle: jangan sync ulang dalam interval (default 30 mnt) kecuali dipaksa
  if (!opts.force && acc.lastSyncAt) {
    const elapsedMin = (Date.now() - acc.lastSyncAt.getTime()) / 60000;
    if (elapsedMin < SYNC_INTERVAL_MIN) {
      return { skipped: true, courses: 0, schedules: 0, tasks: 0, newTasks: 0, grades: 0, campusData: 0 };
    }
  }

  let jwt: string, hebatUserid: string | undefined, hebatToken: string | undefined;
  try {
    jwt = decryptText(acc.jwtEnc);
  } catch (e) {
    throw new Error("Token Kampus Kita rusak — putuskan lalu hubungkan ulang.");
  }
  if (acc.hebatAuthtokenEnc) {
    try {
      hebatUserid = acc.hebatUserid || undefined;
      hebatToken = decryptText(acc.hebatAuthtokenEnc);
    } catch {
      logger.warn(`sync ${userId}: authtoken HE-BAT tidak bisa didekripsi, dilewati`);
    }
  }

  const client = new KampusKitaClient(jwt);

  // Rekap presensi + info kampus: semua GET, paralel dengan fetch utama.
  const campusFetchers: { jenis: CampusDataJenis; fetch: () => Promise<Record<string, unknown>[]> }[] = [
    { jenis: "presensi", fetch: () => client.presensi() },
    { jenis: "pembayaran", fetch: () => client.pembayaran() },
    { jenis: "dosen_wali", fetch: () => client.dosenWali() },
    { jenis: "masa_studi", fetch: () => client.masaStudi() },
    { jenis: "sks_aktif", fetch: () => client.sksAktif() },
    { jenis: "hist_her", fetch: () => client.histHer() },
    { jenis: "penyerahan_ktm", fetch: () => client.penyerahanKtm() },
    { jenis: "kalender_akademik", fetch: () => client.kalenderAkademik() },
  ];

  // --- fetch paralel ---------------------------------------------------------
  const [jadwalRows, semRows, icsText] = await Promise.all([
    client.jadwal(),
    client.semesters(),
    hebatToken && hebatUserid
      ? fetchIcs(hebatUserid, hebatToken).catch((e: any) => {
          // authtoken kadaluarsa bukan bencana — jadwal/grade tetap jalan
          logger.warn(`sync ${userId}: HE-BAT gagal: ${e?.message}`);
          return "";
        })
      : Promise.resolve(""),
  ]);
  const icsEvents = icsText ? parseIcs(icsText) : [];

  const schedules = jadwalToSchedules(jadwalRows);

  // --- upsert courses (externalId = kode MK) ----------------------------------
  const courseIdsByCode = new Map<string, string>();
  let courseCount = 0;
  for (const s of schedules) {
    const ext = s.courseCode || s.courseName;
    if (!ext) continue;
    const course = await upsertByExternal(courses, userId, ext, {
      name: s.courseName || s.courseCode,
      code: s.courseCode || null,
      lecturer: s.lecturer || null,
      credits: s.credits,
      defaultRoom: s.room || null,
    });
    if (s.courseCode) courseIdsByCode.set(s.courseCode, course.id);
    if (!courseIdsByCode.has(ext)) courseIdsByCode.set(ext, course.id);
    courseCount++;
  }

  // --- upsert class_schedules (externalId = kode|hari|mulai|selesai) -----------
  let scheduleCount = 0;
  for (const s of schedules) {
    const courseId = courseIdsByCode.get(s.courseCode || s.courseName);
    if (!courseId || s.dayOfWeek === null || !s.startTime || !s.endTime) continue;
    await upsertByExternal(classSchedules, userId, s.externalId, {
      courseId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room || null,
    });
    scheduleCount++;
  }

  // --- upsert tasks dari iCal HE-BAT (externalId = UID event) ------------------
  const now = Date.now();
  let taskCount = 0, newTasks = 0;
  for (const ev of icsEvents) {
    const t = icsToTask(ev);
    const courseId = t.courseCode ? courseIdsByCode.get(t.courseCode) : undefined;
    const existing = t.externalId
      ? await db.query.tasks.findFirst({ where: and(eq(tasks.userId, userId), eq(tasks.externalId, t.externalId)) })
      : null;
    if (existing) {
      await db.update(tasks).set({
        title: t.title,
        description: t.description || null,
        dueAt: t.dueAt ? new Date(t.dueAt) : null,
        courseId: courseId || existing.courseId,
        updatedAt: new Date(),
      }).where(eq(tasks.id, existing.id));
    } else {
      const id = crypto.randomUUID();
      await db.insert(tasks).values({
        id,
        userId,
        courseId: courseId || null,
        title: t.title,
        description: t.description || null,
        type: "assignment",
        dueAt: t.dueAt ? new Date(t.dueAt) : null,
        priority: "medium",
        status: "NOT_STARTED",
        progress: 0,
        source: "campus",
        externalId: t.externalId,
      });
      newTasks++;
      // notifikasi tugas baru: entity_type task, offset 0 = "baru muncul"
      if (t.dueAt && t.dueAt > now) {
        try {
          const res = await sendPushToUser(userId, {
            title: `📚 Tugas baru: ${t.title}`,
            body: t.courseName ? `${t.courseName} — tenggat ${new Date(t.dueAt).toLocaleString("id-ID")}.` : `Tenggat ${new Date(t.dueAt).toLocaleString("id-ID")}.`,
            data: { url: "/tugas", entityType: "task", entityId: id },
          });
          if (res.sentCount > 0) {
            await db.insert(notificationDeliveries).values({
              id: crypto.randomUUID(),
              userId,
              entityType: "task",
              entityId: id,
              occurrenceAt: new Date(t.dueAt),
              offsetMinutes: 0,
              channel: "web_push",
              status: "SENT",
              sentAt: new Date(),
            });
          }
        } catch (e) {
          logger.warn(`sync ${userId}: notifikasi tugas baru gagal: ${e}`);
        }
      }
    }
    taskCount++;
  }

  // --- upsert grades dari KHS (externalId = semesterId|kode) --------------------
  let gradeCount = 0;
  for (const sem of semRows.slice(0, MAX_KHS_SEMESTERS)) {
    const semId = String(sem.ID_SEMESTER || sem.id || "");
    if (!semId) continue;
    const label = [sem.TAHUN_AJARAN, sem.NM_SEMESTER].filter(Boolean).join(" ").trim() || semId;
    let khsRows: Record<string, unknown>[];
    try {
      khsRows = await client.khs(semId);
    } catch (e: any) {
      logger.warn(`sync ${userId}: KHS semester ${label} gagal: ${e?.message || e}`);
      continue;
    }
    for (const g of khsToGrades(khsRows, label, semId)) {
      const courseId = courseIdsByCode.get(g.courseCode || g.courseName);
      if (!courseId) continue;
      await upsertByExternal(grades, userId, g.externalId, {
        courseId,
        componentName: g.componentName,
        score: g.score,
        letterGrade: g.letterGrade || null,
        gradePoint: g.gradePoint,
      });
      gradeCount++;
    }
  }

  // --- upsert campus_data: rekap presensi + info kampus (toleran per jenis) ----
  let campusDataCount = 0;
  await Promise.all(campusFetchers.map(async ({ jenis, fetch }) => {
    try {
      const rows = await fetch();
      const stored = jenis === "presensi" ? presensiToRecap(rows) : rows;
      await upsertCampusData(userId, jenis, stored);
      campusDataCount++;
    } catch (e: any) {
      logger.warn(`sync ${userId}: info ${jenis} gagal: ${e?.message || e}`);
    }
  }));

  // --- status akhir -------------------------------------------------------------
  const summary: CampusSyncSummary = {
    skipped: false,
    courses: courseCount,
    schedules: scheduleCount,
    tasks: taskCount,
    newTasks,
    grades: gradeCount,
    campusData: campusDataCount,
  };
  await db.update(campusAccounts).set({
    lastSyncAt: new Date(),
    lastSyncStatus: "ok",
    lastSyncSummary: `${taskCount} tugas · ${scheduleCount} jadwal · ${gradeCount} nilai · ${courseCount} MK · ${campusDataCount} info`,
    lastSyncError: null,
    updatedAt: new Date(),
  }).where(eq(campusAccounts.userId, userId));
  return summary;
}

// Pasangan update-error dipakai route API: catat error tanpa melempar lagi
export async function markSyncError(userId: string, message: string): Promise<void> {
  await db.update(campusAccounts).set({
    lastSyncAt: new Date(),
    lastSyncStatus: "error",
    lastSyncError: message.slice(0, 500),
    updatedAt: new Date(),
  }).where(eq(campusAccounts.userId, userId));
}

// Export untuk reconnect HE-BAT: simpan authtoken baru
export async function saveHebatToken(userId: string, userid: string, authtoken: string): Promise<void> {
  await db.update(campusAccounts).set({
    hebatUserid: userid,
    hebatAuthtokenEnc: encryptText(authtoken),
    updatedAt: new Date(),
  }).where(eq(campusAccounts.userId, userId));
}

// Tick cron (QStash /api/internal/reminders/process): sync semua akun kampus
// yang intervalnya sudah lewat. Per-user try/catch supaya satu kegagalan
// tidak memblokir yang lain. Cap per tick 20 user.
export async function syncDueUsers(): Promise<{ synced: number; failed: number; skipped: number }> {
  const intervalMs = SYNC_INTERVAL_MIN * 60 * 1000;
  const cutoff = new Date(Date.now() - intervalMs);
  const due = await db.select().from(campusAccounts)
    .where(or(isNull(campusAccounts.lastSyncAt), lt(campusAccounts.lastSyncAt, cutoff)))
    .limit(20);

  let synced = 0, failed = 0;
  for (const acc of due) {
    try {
      const s = await runCampusSync(acc.userId);
      if (!s.skipped) synced++;
    } catch (e: any) {
      failed++;
      await markSyncError(acc.userId, e?.message || "Sinkronisasi otomatis gagal.");
    }
  }
  return { synced, failed, skipped: Math.max(0, due.length - synced - failed) };
}
