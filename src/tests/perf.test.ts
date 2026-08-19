import { eq, and } from "drizzle-orm";
import { db, users, courses } from "@/lib/db";
import { memClear, memDel, memGet, memSet } from "@/lib/cache/mem-cache";

export async function runPerfTests(assert: (condition: boolean, name: string) => void) {
  // --- mem-cache ---
  memClear();
  memSet("a:1", { x: 1 }, 60_000);
  assert(memGet<{ x: number }>("a:1")?.x === 1, "mem-cache: get setelah set");

  memSet("a:2", { x: 2 }, -1); // TTL negatif — deterministik sudah lewat saat dibaca
  assert(memGet("a:2") === null, "mem-cache: TTL expired → null");

  memDel("a:");
  assert(memGet("a:1") === null && memGet("a:2") === null, "mem-cache: memDel prefix");
  memClear();

  // --- mem-cache: tipe tidak bocor antar key ---
  memSet("b:1", 42, 60_000);
  assert(memGet<number>("b:1") === 42, "mem-cache: nilai primitif");
  memClear();

  // --- Course sync batching performance test ---
  console.log("  ── Course sync batching performance benchmark ──");
  const testUserId = "perf-test-user-id";
  try {
    // Ensure test user exists
    await db.insert(users).values({
      id: testUserId,
      username: "perftestuser",
      usernameNormalized: "perftestuser",
    }).onConflictDoNothing();

    // Cleanup previous test courses
    await db.delete(courses).where(eq(courses.userId, testUserId));

    // Prepare 30 distinct schedule entries
    const sampleSchedules = Array.from({ length: 30 }, (_, i) => ({
      courseCode: `KODE${100 + i}`,
      courseName: `Mata Kuliah Test ${i}`,
      lecturer: `Dosen ${i}`,
      credits: (i % 4) + 1,
      room: `R.${i}`,
    }));

    // Sequential N+1 execution baseline benchmark
    const startSeq = performance.now();
    for (const s of sampleSchedules) {
      const ext = s.courseCode || s.courseName;
      const existing = await db.select().from(courses).where(
        and(eq(courses.userId, testUserId), eq(courses.externalId, ext))
      ).limit(1).then((rows) => rows[0]);

      if (existing) {
        await db.update(courses).set({
          name: s.courseName,
          code: s.courseCode,
          lecturer: s.lecturer,
          credits: s.credits,
          defaultRoom: s.room,
          updatedAt: new Date(),
        }).where(eq(courses.id, existing.id));
      } else {
        await db.insert(courses).values({
          id: crypto.randomUUID(),
          userId: testUserId,
          externalId: ext,
          name: s.courseName,
          code: s.courseCode,
          lecturer: s.lecturer,
          credits: s.credits,
          defaultRoom: s.room,
        });
      }
    }
    const seqDuration = performance.now() - startSeq;
    console.log(`    Sequential N+1 duration (30 courses): ${seqDuration.toFixed(2)} ms`);

    // Batched execution benchmark on the same updated dataset
    const startBatch = performance.now();
    // 1. Deduplicate by externalId
    const courseMap = new Map<string, typeof sampleSchedules[0]>();
    for (const s of sampleSchedules) {
      const ext = s.courseCode || s.courseName;
      if (ext && !courseMap.has(ext)) {
        courseMap.set(ext, s);
      }
    }

    // 2. Single query fetch
    const existingCourses = await db.select().from(courses).where(eq(courses.userId, testUserId));
    const existingMap = new Map(existingCourses.map(c => [c.externalId, c]));

    const newToInsert: any[] = [];
    const updatesToRun: Promise<any>[] = [];

    for (const [ext, s] of courseMap.entries()) {
      const existing = existingMap.get(ext);
      if (existing) {
        updatesToRun.push(
          db.update(courses).set({
            name: s.courseName || s.courseCode,
            code: s.courseCode || null,
            lecturer: s.lecturer || null,
            credits: s.credits,
            defaultRoom: s.room || null,
            updatedAt: new Date(),
          }).where(eq(courses.id, existing.id))
        );
      } else {
        newToInsert.push({
          id: crypto.randomUUID(),
          userId: testUserId,
          externalId: ext,
          name: s.courseName || s.courseCode,
          code: s.courseCode || null,
          lecturer: s.lecturer || null,
          credits: s.credits,
          defaultRoom: s.room || null,
        });
      }
    }

    if (newToInsert.length > 0) {
      await db.insert(courses).values(newToInsert);
    }
    if (updatesToRun.length > 0) {
      await Promise.all(updatesToRun);
    }
    const batchDuration = performance.now() - startBatch;
    console.log(`    Batched duration (30 courses): ${batchDuration.toFixed(2)} ms`);

    assert(batchDuration <= seqDuration, "Batched execution is faster or equal to N+1 sequential queries");

    // Clean up test data
    await db.delete(courses).where(eq(courses.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  } catch (err) {
    console.error("Perf test error:", err);
    assert(false, `Perf test failed with error: ${err}`);
  }
}
