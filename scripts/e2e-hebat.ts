// E2E lokal jalur HE-BAT dengan authtoken NYATA (dari env, tidak di-commit).
// Jalankan: FORFH_HEBAT_USERID=56330 FORFH_HEBAT_TOKEN=... npx tsx scripts/e2e-hebat.ts
import { fetchIcs, parseIcs } from "../src/lib/campus/hebat";
import { icsToTask } from "../src/lib/campus/mappings";

async function main() {
  const userid = process.env.FORFH_HEBAT_USERID;
  const token = process.env.FORFH_HEBAT_TOKEN;
  if (!userid || !token) {
    console.error("Butuh FORFH_HEBAT_USERID dan FORFH_HEBAT_TOKEN (authtoken dari /calendar/export.php).");
    process.exit(1);
  }

  console.log("1) fetchIcs dengan authtoken...");
  const ics = await fetchIcs(userid, token);
  console.log("   panjang feed:", ics.length, "chars");

  console.log("2) parseIcs...");
  const events = parseIcs(ics);
  console.log("   event:", events.length);

  console.log("3) icsToTask (mapping)...");
  let withCourse = 0;
  for (const ev of events) {
    const t = icsToTask(ev);
    if (t.courseCode) withCourse++;
    console.log(`   - [${t.externalId.slice(0, 20)}] "${t.title}" due=${t.dueAt ? new Date(t.dueAt).toISOString() : "?"} MK=${t.courseCode || "-"} ${t.courseName || ""}`);
  }
  if (events.length === 0) {
    console.error("TIDAK ADA EVENT — feed kosong?");
    process.exit(1);
  }
  console.log(`   event dengan kode MK: ${withCourse}/${events.length}`);
  console.log("E2E HE-BAT OK");
}

main().catch((e) => {
  console.error("E2E GAGAL:", e?.message || e);
  process.exit(1);
});
