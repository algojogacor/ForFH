// Verifikasi hasil sync di DB lokal (jalankan setelah E2E login).
const { createClient } = require("@libsql/client");
const client = createClient({ url: "file:forfh-local.db" });

async function q(sql) {
  const r = await client.execute(sql);
  return r.rows;
}

async function main() {
  const acc = await q("SELECT campus_email, campus_nim, hebat_userid, last_sync_status FROM campus_accounts");
  console.log("campus_accounts:", JSON.stringify(acc));

  const tasks = await q("SELECT title, external_id, source, due_at FROM tasks WHERE source='campus'");
  console.log("tasks campus:", tasks.length);
  for (const t of tasks) console.log("  -", t.title, "| ext:", t.external_id.slice(0, 30), "| due:", t.due_at ? new Date(Number(t.due_at)).toISOString() : "null");

  const courses = await q("SELECT name, code, external_id FROM courses WHERE external_id IS NOT NULL");
  console.log("courses ter-link:", courses.length);
  for (const c of courses.slice(0, 4)) console.log("  -", c.name, "|", c.code);

  const schedules = await q("SELECT day_of_week, start_time, end_time, room FROM class_schedules WHERE external_id IS NOT NULL");
  console.log("schedules:", schedules.length, "| contoh:", JSON.stringify(schedules[0]));

  const grades = await q("SELECT component_name, letter_grade, grade_point FROM grades WHERE external_id IS NOT NULL");
  console.log("grades:", grades.length, "| contoh:", JSON.stringify(grades[0]));
}
main().catch((e) => { console.error(e); process.exit(1); });
