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
// Token kampus disimpan plaintext apa adanya (nilai tersimpan = nilai asli).
// Data lama berformat v1: (AES-256-GCM) di-decrypt sekali jalan saat sync.
// Password tidak pernah tersimpan.
import { and, eq, lt, or, isNull, ne, desc, inArray } from "drizzle-orm";
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
import { memDel } from "@/lib/cache/mem-cache";
import { mapLimit } from "@/lib/notifications/worker";
import { decryptLegacyV1, isLegacyV1 } from "@/lib/crypto/legacy-v1";
import { sendPushToUser } from "@/lib/notifications/web-push";
import { KampusKitaClient } from "./kampuskita";
import { fetchIcs, parseIcs } from "./hebat";
import {
  jadwalToSchedules,
  khsToGrades,
  icsToTask,
  presensiToRecap,
  instructionFor,
  instructionCounted,
} from "./mappings";
import type { HebatCourseInstructions } from "./mappings";

const SYNC_INTERVAL_MIN = Number(process.env.FORFH_SYNC_INTERVAL_MIN || 30);
// Sync dianggap stale (proses mati di tengah — redeploy/crash) setelah 10 menit
const STALE_SYNC_MS = 10 * 60 * 1000;
const MAX_KHS_SEMESTERS = 6;
const TIER2_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 jam untuk Tier 2 (statis harian)

export interface CampusSyncSummary {
  skipped: boolean;
  courses: number;
  schedules: number;
  tasks: number;
  newTasks: number;
  grades: number;
  campusData: number; // jumlah jenis info kampus/rekap yang berhasil di-update
  instruksi: number; // jumlah tugas yang mendapat instruksi dari section summary HE-BAT
  reason?: "throttled" | "in_progress"; // alasan skip (opsional, saat skipped=true)
}

// Instruksi tugas HE-BAT hasil crawl saat connect (campus_data jenis
// "instruksi_tugas"). JSON.parse defensif — data lama/rusak dianggap kosong.
async function loadInstructions(userId: string): Promise<HebatCourseInstructions[]> {
  const row = await db.select().from(campusData).where(
    and(eq(campusData.userId, userId), eq(campusData.jenis, "instruksi_tugas"))
  ).limit(1).then((rows) => rows[0]);
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.dataJson);
    return Array.isArray(parsed) ? (parsed as HebatCourseInstructions[]) : [];
  } catch {
    return [];
  }
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
export async function upsertCampusData(userId: string, jenis: CampusDataJenis, rows: unknown[]): Promise<void> {
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

// Baca token kampus tersimpan: nilai baru plaintext apa adanya; data lama
// berformat v1: (terenkripsi AES-256-GCM) di-decrypt.
export function readToken(stored: string): string {
  return isLegacyV1(stored) ? decryptLegacyV1(stored) : stored;
}

// Tulis label langkah sync berjalan (1 query ringan; dipantau UI via sync-status)
export async function setSyncStep(userId: string, step: string): Promise<void> {
  try {
    await db.update(campusAccounts).set({ syncStep: step }).where(eq(campusAccounts.userId, userId));
  } catch (e: any) {
    logger.warn(`setSyncStep ${userId}: ${e?.message || e}`);
  }
}

/**
 * Jalankan sinkronisasi untuk satu user dengan tiered syncing:
 * - Tier 1 (Dinamis - 30 menit): Feed Tugas iCal HE-BAT & Rekap Presensi.
 * - Tier 2 (Statis Harian - 24 jam): Kalender akademik, info profil, dosen wali,
 *   masa studi, SKS, pembayaran, HER, KTM, peserta MK, dan semester KHS aktif.
 * - Tier 3 (Semesteran - manual-only / login bootstrap): Jadwal kuliah & riwayat KHS lama.
 */
export async function runCampusSync(userId: string, opts: { force?: boolean } = {}): Promise<CampusSyncSummary> {
  const acc = await findAccount(userId);
  if (!acc) throw new Error("Akun kampus belum terhubung.");

  // Throttle: jangan sync ulang dalam interval (default 30 mnt) kecuali dipaksa
  if (!opts.force && acc.lastSyncAt) {
    const elapsedMin = (Date.now() - acc.lastSyncAt.getTime()) / 60000;
    if (elapsedMin < SYNC_INTERVAL_MIN) {
      return { skipped: true, reason: "throttled", courses: 0, schedules: 0, tasks: 0, newTasks: 0, grades: 0, campusData: 0, instruksi: 0 };
    }
  }

  // --- Lock: atomic claim (conditional UPDATE). Cegah dua sync paralel per user
  // (login bootstrap, cron, tombol manual). SELECT tidak cukup — race antar
  // proses/instance. Baris dengan state running yang stale (> 10 mnt) diambil alih.
  const claim = await db.update(campusAccounts).set({
    syncState: "running",
    syncStep: "mulai",
    syncStartedAt: new Date(),
  }).where(and(
    eq(campusAccounts.userId, userId),
    or(
      ne(campusAccounts.syncState, "running"),
      isNull(campusAccounts.syncStartedAt),
      lt(campusAccounts.syncStartedAt, new Date(Date.now() - STALE_SYNC_MS)),
    ),
  ));
  // @libsql/client 0.14: hasil run() = { rows, rowsAffected, lastInsertRowid, ... }
  // (tidak ada `changes`/`success` di versi ini). rowsAffected 0 = WHERE tidak
  // match = user lain memegang lock (state running & fresh).
  if (claim.rowsAffected === 0) {
    return { skipped: true, reason: "in_progress", courses: 0, schedules: 0, tasks: 0, newTasks: 0, grades: 0, campusData: 0, instruksi: 0 };
  }

  try {
    let jwt: string, hebatUserid: string | undefined, hebatToken: string | undefined;
    try {
      jwt = readToken(acc.jwt);
    } catch (e) {
      throw new Error("Token Kampus Kita rusak — putuskan lalu hubungkan ulang.");
    }
    if (acc.hebatAuthtoken) {
      try {
        hebatUserid = acc.hebatUserid || undefined;
        hebatToken = readToken(acc.hebatAuthtoken);
      } catch {
        logger.warn(`sync ${userId}: authtoken HE-BAT tidak bisa dibaca, dilewati`);
      }
    }
    // Migrasi data lama (v1:) → plaintext: tulis ulang sekali jalan.
    if (isLegacyV1(acc.jwt)) {
      await db.update(campusAccounts).set({ jwt }).where(eq(campusAccounts.userId, userId)).catch(() => {});
    }
    if (acc.hebatAuthtoken && isLegacyV1(acc.hebatAuthtoken) && hebatToken) {
      await db.update(campusAccounts).set({ hebatAuthtoken: hebatToken }).where(eq(campusAccounts.userId, userId)).catch(() => {});
    }

    // Instruksi tugas (section summary) dari crawl saat connect — dipakai untuk
    // mengisi description tugas yang kosong (DESCRIPTION iCal selalu kosong).
    const instructions = await loadInstructions(userId);

    const client = new KampusKitaClient(jwt);

    // 1. Ambil riwayat update tiap kategori di campus_data untuk evaluasi Tier 2
    const existingCampusData = await db.select({
      jenis: campusData.jenis,
      updatedAt: campusData.updatedAt,
    }).from(campusData).where(eq(campusData.userId, userId));

    const campusDataUpdatedMap = new Map<string, Date>();
    for (const r of existingCampusData) {
      if (r.updatedAt) campusDataUpdatedMap.set(r.jenis, r.updatedAt);
    }

    // 2. Evaluasi status jadwal kuliah & grades untuk keputusan Tier 2 & Tier 3
    const [hasExistingSchedules, latestGrade] = await Promise.all([
      db.select({ id: classSchedules.id })
        .from(classSchedules)
        .where(eq(classSchedules.userId, userId))
        .limit(1)
        .then((r) => r.length > 0),
      db.select({ updatedAt: grades.updatedAt })
        .from(grades)
        .where(eq(grades.userId, userId))
        .orderBy(desc(grades.updatedAt))
        .limit(1)
        .then((r) => r[0]),
    ]);

    const nowTime = Date.now();

    // Helper: apakah kategori Tier 2 sudah waktunya di-sync (24 jam atau force atau belum ada data)
    const isTier2Due = (jenis: CampusDataJenis) => {
      if (opts.force) return true;
      const last = campusDataUpdatedMap.get(jenis);
      if (!last) return true;
      return (nowTime - last.getTime()) >= TIER2_INTERVAL_MS;
    };

    // Tier 3: Jadwal kuliah hanya di-fetch saat force manual ATAU initial bootstrap (belum punya jadwal)
    const shouldFetchJadwal = opts.force || !hasExistingSchedules;

    // Tier 2: Nilai KHS semester aktif di-fetch jika force ATAU belum ada nilai ATAU sudah > 24 jam
    const shouldFetchKhs = opts.force || !latestGrade?.updatedAt || (nowTime - latestGrade.updatedAt.getTime() >= TIER2_INTERVAL_MS);

    // Muat daftar MK yang sudah ada ke map agar tugas dan nilai tetap terpetakan ke courseId
    const courseIdsByCode = new Map<string, string>();
    const existingCourses = await db.select({ id: courses.id, code: courses.code, name: courses.name })
      .from(courses)
      .where(eq(courses.userId, userId));
    for (const c of existingCourses) {
      if (c.code) courseIdsByCode.set(c.code, c.id);
      if (c.name && !courseIdsByCode.has(c.name)) courseIdsByCode.set(c.name, c.id);
    }

    // Rekap presensi (Tier 1) + info kampus (Tier 2)
    const allCampusFetchers: { jenis: CampusDataJenis; fetch: () => Promise<Record<string, unknown>[]> }[] = [
      { jenis: "presensi", fetch: () => client.presensi() }, // Tier 1: selalu jalan
      { jenis: "pembayaran", fetch: () => client.pembayaran() }, // Tier 2
      { jenis: "dosen_wali", fetch: () => client.dosenWali() }, // Tier 2
      { jenis: "masa_studi", fetch: () => client.masaStudi() }, // Tier 2
      { jenis: "sks_aktif", fetch: () => client.sksAktif() }, // Tier 2
      { jenis: "hist_her", fetch: () => client.histHer() }, // Tier 2
      { jenis: "penyerahan_ktm", fetch: () => client.penyerahanKtm() }, // Tier 2
      { jenis: "kalender_akademik", fetch: () => client.kalenderAkademik() }, // Tier 2
      { jenis: "status_mhs", fetch: () => client.status() }, // Tier 2
      { jenis: "peserta_mk", fetch: () => client.pesertaMataKuliah() }, // Tier 2
    ];

    const activeFetchers = allCampusFetchers.filter(({ jenis }) => {
      if (jenis === "presensi") return true; // Tier 1: selalu jalan
      return isTier2Due(jenis); // Tier 2: jalan jika > 24 jam atau force
    });

    // --- fetch paralel tier-aware ---------------------------------------------
    await setSyncStep(userId, shouldFetchJadwal ? "jadwal" : "tugas");

    const jadwalPromise = shouldFetchJadwal
      ? client.jadwal().catch((e: any) => {
          logger.warn(`sync ${userId}: jadwal gagal: ${e?.message || e}`);
          return [];
        })
      : Promise.resolve([]);

    const semPromise = shouldFetchKhs
      ? client.semesters().catch((e: any) => {
          logger.warn(`sync ${userId}: semesters KHS gagal: ${e?.message || e}`);
          return [];
        })
      : Promise.resolve([]);

    const icsPromise = hebatToken && hebatUserid
      ? fetchIcs(hebatUserid, hebatToken).catch((e: any) => {
          logger.warn(`sync ${userId}: HE-BAT gagal: ${e?.message}`);
          return "";
        })
      : Promise.resolve("");

    const [jadwalRows, semRows, icsText] = await Promise.all([
      jadwalPromise,
      semPromise,
      icsPromise,
    ]);

    const icsEvents = icsText ? parseIcs(icsText) : [];

    // --- upsert courses & class_schedules jika jadwal di-fetch -----------------
    let courseCount = 0;
    let scheduleCount = 0;
    if (shouldFetchJadwal && jadwalRows.length > 0) {
      await setSyncStep(userId, "kursus");
      const schedules = jadwalToSchedules(jadwalRows);

      // 1. Batch upsert courses
      const uniqueCoursesMap = new Map<string, typeof schedules[0]>();
      for (const s of schedules) {
        const ext = s.courseCode || s.courseName;
        if (ext && !uniqueCoursesMap.has(ext)) {
          uniqueCoursesMap.set(ext, s);
        }
      }

      const existingCoursesList = await db.select().from(courses).where(eq(courses.userId, userId));
      const existingCourseByExt = new Map(existingCoursesList.map((c) => [c.externalId, c]));

      const newCoursesToInsert: (typeof courses.$inferInsert)[] = [];
      const courseUpdatePromises: Promise<unknown>[] = [];

      for (const [ext, s] of uniqueCoursesMap.entries()) {
        const existing = existingCourseByExt.get(ext);
        const courseValues = {
          name: s.courseName || s.courseCode,
          code: s.courseCode || null,
          lecturer: s.lecturer || null,
          credits: s.credits,
          defaultRoom: s.room || null,
          updatedAt: new Date(),
        };

        if (existing) {
          courseIdsByCode.set(ext, existing.id);
          if (s.courseCode) courseIdsByCode.set(s.courseCode, existing.id);
          courseUpdatePromises.push(
            db.update(courses).set(courseValues).where(eq(courses.id, existing.id))
          );
        } else {
          const newId = crypto.randomUUID();
          courseIdsByCode.set(ext, newId);
          if (s.courseCode) courseIdsByCode.set(s.courseCode, newId);
          newCoursesToInsert.push({
            id: newId,
            userId,
            externalId: ext,
            ...courseValues,
          });
        }
      }

      if (newCoursesToInsert.length > 0) {
        await db.insert(courses).values(newCoursesToInsert);
      }
      if (courseUpdatePromises.length > 0) {
        await Promise.all(courseUpdatePromises);
      }
      courseCount = uniqueCoursesMap.size;

      // 2. Batch upsert class_schedules
      const existingSchedules = await db
        .select({ id: classSchedules.id, externalId: classSchedules.externalId })
        .from(classSchedules)
        .where(eq(classSchedules.userId, userId));
      const existingScheduleMap = new Map<string, string>();
      for (const row of existingSchedules) {
        if (row.externalId) {
          existingScheduleMap.set(row.externalId, row.id);
        }
      }

      const schedulesToInsert: (typeof classSchedules.$inferInsert)[] = [];
      const scheduleUpdatePromises: Promise<unknown>[] = [];

      for (const s of schedules) {
        const courseId = courseIdsByCode.get(s.courseCode || s.courseName);
        if (!courseId || s.dayOfWeek === null || !s.startTime || !s.endTime) continue;
        const values = {
          courseId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room || null,
          updatedAt: new Date(),
        };
        const existingId = existingScheduleMap.get(s.externalId);
        if (existingId) {
          scheduleUpdatePromises.push(
            db.update(classSchedules).set(values).where(eq(classSchedules.id, existingId))
          );
        } else {
          schedulesToInsert.push({
            id: crypto.randomUUID(),
            userId,
            externalId: s.externalId,
            ...values,
          });
        }
        scheduleCount++;
      }

      if (schedulesToInsert.length > 0) {
        await db.insert(classSchedules).values(schedulesToInsert);
      }
      if (scheduleUpdatePromises.length > 0) {
        await Promise.all(scheduleUpdatePromises);
      }
    }

    // --- upsert tasks dari iCal HE-BAT (Tier 1: selalu jalan tiap 30m) ---------
    await setSyncStep(userId, "tugas");
    const now = Date.now();
    let taskCount = 0, newTasks = 0, instructionCount = 0;

    const taskItems = icsEvents.map((ev) => {
      const t = icsToTask(ev);
      const instr = t.description ? null : instructionFor(instructions, t);
      return { ev, t, instr };
    });

    const taskExternalIds = Array.from(
      new Set(taskItems.map((item) => item.t.externalId).filter((id): id is string => Boolean(id)))
    );

    const existingTasksList = taskExternalIds.length > 0
      ? await db.select().from(tasks).where(
          and(eq(tasks.userId, userId), inArray(tasks.externalId, taskExternalIds))
        )
      : [];

    const existingTaskMap = new Map(existingTasksList.map((r) => [r.externalId, r]));

    const tasksToInsert: (typeof tasks.$inferInsert)[] = [];
    const taskUpdatePromises: Promise<unknown>[] = [];
    const newTasksForNotification: { id: string; title: string; courseName?: string; dueAt: number }[] = [];

    for (const item of taskItems) {
      const { t, instr } = item;
      const existing = t.externalId ? existingTaskMap.get(t.externalId) : null;
      const description = existing
        ? (existing.description || instr || t.description || null)
        : (instr || t.description || null);

      if (instructionCounted(instr, existing?.description)) instructionCount++;

      const courseId = t.courseCode ? courseIdsByCode.get(t.courseCode) : undefined;

      if (existing) {
        taskUpdatePromises.push(
          db.update(tasks).set({
            title: t.title,
            description,
            dueAt: t.dueAt ? new Date(t.dueAt) : null,
            courseId: courseId || existing.courseId,
            updatedAt: new Date(),
          }).where(eq(tasks.id, existing.id))
        );
      } else {
        const id = crypto.randomUUID();
        const newTaskRow: typeof tasks.$inferInsert = {
          id,
          userId,
          courseId: courseId || null,
          title: t.title,
          description,
          type: "assignment",
          dueAt: t.dueAt ? new Date(t.dueAt) : null,
          priority: "medium",
          status: "NOT_STARTED",
          progress: 0,
          source: "campus",
          externalId: t.externalId,
        };
        tasksToInsert.push(newTaskRow);
        if (t.externalId) {
          existingTaskMap.set(t.externalId, newTaskRow as any);
        }
        newTasks++;

        if (t.dueAt && t.dueAt > now) {
          newTasksForNotification.push({
            id,
            title: t.title,
            courseName: t.courseName,
            dueAt: t.dueAt,
          });
        }
      }
      taskCount++;
    }

    if (tasksToInsert.length > 0) {
      await db.insert(tasks).values(tasksToInsert);
    }
    if (taskUpdatePromises.length > 0) {
      await Promise.all(taskUpdatePromises);
    }

    // Kirim notifikasi push untuk tugas-tugas baru
    for (const n of newTasksForNotification) {
      try {
        const res = await sendPushToUser(userId, {
          title: `📚 Tugas baru: ${n.title}`,
          body: n.courseName ? `${n.courseName} — tenggat ${new Date(n.dueAt).toLocaleString("id-ID")}.` : `Tenggat ${new Date(n.dueAt).toLocaleString("id-ID")}.`,
          data: { url: "/tugas", entityType: "task", entityId: n.id },
        });
        if (res.sentCount > 0) {
          await db.insert(notificationDeliveries).values({
            id: crypto.randomUUID(),
            userId,
            entityType: "task",
            entityId: n.id,
            occurrenceAt: new Date(n.dueAt),
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

    // --- upsert grades dari KHS jika shouldFetchKhs ----------------------------
    await setSyncStep(userId, "nilai");
    let gradeCount = 0;
    if (shouldFetchKhs && semRows.length > 0) {
      // Jika force manual: fetch semua semester (maks 6 semester).
      // Jika cron berkala: HANYA fetch semester aktif / berjalan (index 0).
      const targetSemesters = opts.force
        ? semRows.slice(0, MAX_KHS_SEMESTERS)
        : semRows.slice(0, 1);

      for (const sem of targetSemesters) {
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
    }

    // --- upsert campus_data: presensi (Tier 1) + info harian (Tier 2 due) ------
    await setSyncStep(userId, "info");
    let campusDataCount = 0;
    await Promise.all(activeFetchers.map(async ({ jenis, fetch }) => {
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
      instruksi: instructionCount,
    };
    const instruksiSuffix = instructionCount > 0 ? ` · ${instructionCount} instruksi` : "";
    await db.update(campusAccounts).set({
      lastSyncAt: new Date(),
      lastSyncStatus: "ok",
      lastSyncSummary: `${taskCount} tugas · ${scheduleCount} jadwal · ${gradeCount} nilai · ${courseCount} MK · ${campusDataCount} info${instruksiSuffix}`,
      lastSyncError: null,
      syncState: "idle",
      syncStep: null,
      syncStartedAt: null,
      updatedAt: new Date(),
    }).where(eq(campusAccounts.userId, userId));
    memDel(`campus-info:${userId}`);
    memDel(`tasks:${userId}`);
    await setSyncStep(userId, "selesai");
    return summary;
  } finally {
    // Jaring pengaman: apa pun yang terjadi, lock harus lepas
    await db.update(campusAccounts)
      .set({ syncState: "idle", syncStep: null, syncStartedAt: null })
      .where(eq(campusAccounts.userId, userId))
      .run()
      .catch(() => {});
  }
}

// Pasangan update-error dipakai route API: catat error tanpa melempar lagi
export async function markSyncError(userId: string, message: string): Promise<void> {
  await db.update(campusAccounts).set({
    lastSyncAt: new Date(),
    lastSyncStatus: "error",
    lastSyncError: message.slice(0, 500),
    syncState: "idle",
    syncStep: null,
    syncStartedAt: null,
    updatedAt: new Date(),
  }).where(eq(campusAccounts.userId, userId));
  memDel(`campus-info:${userId}`);
  memDel(`tasks:${userId}`);
}

// Export untuk reconnect HE-BAT: simpan authtoken baru
export async function saveHebatToken(userId: string, userid: string, authtoken: string): Promise<void> {
  await db.update(campusAccounts).set({
    hebatUserid: userid,
    hebatAuthtoken: authtoken,
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
  await mapLimit(due, 3, async (acc) => {
    try {
      const s = await runCampusSync(acc.userId);
      if (!s.skipped) synced++;
    } catch (e: any) {
      failed++;
      await markSyncError(acc.userId, e?.message || "Sinkronisasi otomatis gagal.");
    }
  });
  return { synced, failed, skipped: Math.max(0, due.length - synced - failed) };
}
