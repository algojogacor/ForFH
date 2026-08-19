import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq, inArray } from "drizzle-orm";
import * as dbSchema from "@/lib/db/schema";
import { memClear, memDel, memGet, memSet } from "@/lib/cache/mem-cache";
import { icsToTask, instructionFor, instructionCounted } from "@/lib/campus/mappings";
import type { IcsEvent } from "@/lib/campus/hebat";

const MEM_DDL = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_normalized TEXT NOT NULL UNIQUE, password TEXT, display_name TEXT, email TEXT, email_normalized TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000), updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000))`,
  `CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, academic_term_id TEXT, name TEXT NOT NULL, code TEXT, lecturer TEXT, credits INTEGER DEFAULT 2, color TEXT DEFAULT '#3b82f6', default_room TEXT, online_url TEXT, notes TEXT, archived INTEGER NOT NULL DEFAULT 0, external_id TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000), updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000))`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, course_id TEXT, title TEXT NOT NULL, description TEXT, type TEXT NOT NULL DEFAULT 'assignment', due_at INTEGER, internal_target_at INTEGER, priority TEXT NOT NULL DEFAULT 'medium', estimated_minutes INTEGER, status TEXT NOT NULL DEFAULT 'NOT_STARTED', progress INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', completed_at INTEGER, deleted_at INTEGER, version INTEGER NOT NULL DEFAULT 1, external_id TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000), updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000))`,
  `CREATE TABLE IF NOT EXISTS notification_deliveries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, occurrence_at INTEGER NOT NULL, offset_minutes INTEGER NOT NULL, channel TEXT NOT NULL DEFAULT 'web_push', status TEXT NOT NULL DEFAULT 'SENT', sent_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000))`,
];

async function createMemDb() {
  const client = createClient({ url: ":memory:" });
  for (const ddl of MEM_DDL) await client.execute(ddl);
  return drizzle(client, { schema: dbSchema });
}

export async function runPerfTests(assert: (condition: boolean, name: string) => void) {
  console.log("  ── Memory cache tests ──");
  memClear();
  memSet("a:1", { x: 1 }, 60_000);
  assert(memGet<{ x: number }>("a:1")?.x === 1, "mem-cache: get setelah set");

  memSet("a:2", { x: 2 }, -1);
  assert(memGet("a:2") === null, "mem-cache: TTL expired → null");

  memDel("a:");
  assert(memGet("a:1") === null && memGet("a:2") === null, "mem-cache: memDel prefix");
  memClear();

  memSet("b:1", 42, 60_000);
  assert(memGet<number>("b:1") === 42, "mem-cache: nilai primitif");
  memClear();

  console.log("  ── Task sync performance benchmark ──");
  const memDb = await createMemDb();
  const userId = "user_perf_test";

  await memDb.insert(dbSchema.users).values({
    id: userId,
    username: "perftest",
    usernameNormalized: "perftest",
  });

  const numEvents = 100;
  const events: IcsEvent[] = [];

  for (let i = 1; i <= numEvents; i++) {
    const extId = `task_uid_${i}@hebat.elearning.unair.ac.id`;
    events.push({
      UID: extId,
      DTSTART: "20260814T050000Z",
      SUMMARY: `Task ${i} is due`,
      DESCRIPTION: `Description for task ${i}`,
      CATEGORIES: `2026Ganjil - CS10${i % 5} - Course ${i % 5} - S1`,
    });
    if (i <= 50) {
      await memDb.insert(dbSchema.tasks).values({
        id: `existing_task_id_${i}`,
        userId,
        title: `Task ${i}`,
        description: `Old description for task ${i}`,
        source: "campus",
        externalId: extId,
      });
    }
  }

  // Measure Unoptimized N+1
  const startNPlusOne = performance.now();
  let taskCount1 = 0, newTasks1 = 0, instructionCount1 = 0;
  for (const ev of events) {
    const t = icsToTask(ev);
    const instr = t.description ? null : instructionFor([], t);
    const existing = t.externalId
      ? await memDb.query.tasks.findFirst({ where: and(eq(dbSchema.tasks.userId, userId), eq(dbSchema.tasks.externalId, t.externalId)) })
      : null;
    const description = existing
      ? (existing.description || instr || t.description || null)
      : (instr || t.description || null);
    if (instructionCounted(instr, existing?.description)) instructionCount1++;
    if (existing) {
      await memDb.update(dbSchema.tasks).set({
        title: t.title,
        description,
        dueAt: t.dueAt ? new Date(t.dueAt) : null,
        updatedAt: new Date(),
      }).where(eq(dbSchema.tasks.id, existing.id));
    } else {
      const id = crypto.randomUUID();
      await memDb.insert(dbSchema.tasks).values({
        id,
        userId,
        title: t.title,
        description,
        type: "assignment",
        dueAt: t.dueAt ? new Date(t.dueAt) : null,
        priority: "medium",
        status: "NOT_STARTED",
        progress: 0,
        source: "campus",
        externalId: t.externalId,
      });
      newTasks1++;
    }
    taskCount1++;
  }
  const durationNPlusOne = performance.now() - startNPlusOne;

  // Clean DB for second run
  await memDb.delete(dbSchema.tasks).where(eq(dbSchema.tasks.userId, userId));
  for (let i = 1; i <= 50; i++) {
    const extId = `task_uid_${i}@hebat.elearning.unair.ac.id`;
    await memDb.insert(dbSchema.tasks).values({
      id: `existing_task_id_${i}`,
      userId,
      title: `Task ${i}`,
      description: `Old description for task ${i}`,
      source: "campus",
      externalId: extId,
    });
  }

  // Measure Optimized Batching
  const startBatch = performance.now();
  let taskCount2 = 0, newTasks2 = 0, instructionCount2 = 0;

  const taskItems = events.map((ev) => {
    const t = icsToTask(ev);
    const instr = t.description ? null : instructionFor([], t);
    return { ev, t, instr };
  });

  const externalIds = Array.from(new Set(taskItems.map((item) => item.t.externalId).filter(Boolean)));

  const existingTasksList = externalIds.length > 0
    ? await memDb.select().from(dbSchema.tasks).where(
        and(eq(dbSchema.tasks.userId, userId), inArray(dbSchema.tasks.externalId, externalIds))
      )
    : [];

  const existingByExternalId = new Map(existingTasksList.map((row) => [row.externalId!, row]));

  const tasksToInsert: (typeof dbSchema.tasks.$inferInsert)[] = [];
  const updatePromises: Promise<unknown>[] = [];

  for (const item of taskItems) {
    const { t, instr } = item;
    const existing = t.externalId ? existingByExternalId.get(t.externalId) : null;
    const description = existing
      ? (existing.description || instr || t.description || null)
      : (instr || t.description || null);

    if (instructionCounted(instr, existing?.description)) instructionCount2++;

    if (existing) {
      updatePromises.push(
        memDb.update(dbSchema.tasks).set({
          title: t.title,
          description,
          dueAt: t.dueAt ? new Date(t.dueAt) : null,
          updatedAt: new Date(),
        }).where(eq(dbSchema.tasks.id, existing.id))
      );
    } else {
      const id = crypto.randomUUID();
      const newTaskRow = {
        id,
        userId,
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
        existingByExternalId.set(t.externalId, newTaskRow as any);
      }
      newTasks2++;
    }
    taskCount2++;
  }

  if (tasksToInsert.length > 0) {
    await memDb.insert(dbSchema.tasks).values(tasksToInsert);
  }
  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
  }

  const durationBatch = performance.now() - startBatch;

  console.log(`  📊 Baseline (N+1 query per event) for ${numEvents} events: ${durationNPlusOne.toFixed(2)} ms`);
  console.log(`  📊 Optimized (1 batch select + 1 batch insert + parallel updates): ${durationBatch.toFixed(2)} ms`);
  const speedup = (durationNPlusOne / Math.max(durationBatch, 0.01)).toFixed(2);
  console.log(`  🚀 Speedup: ${speedup}x faster`);

  assert(taskCount2 === 100 && newTasks2 === 50, "Batch method correctly processed 100 tasks (50 new)");
  assert(durationBatch < durationNPlusOne, "Batch method is faster than N+1");
}
