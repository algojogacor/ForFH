import { runAuthTests } from "./auth.test";
import { runCrossUserTests } from "./cross-user.test";
import { runAITests } from "./ai.test";
import { runDriveTests } from "./drive.test";
import { runPasalTests } from "./pasal.test";
import { runReminderTests } from "./reminders.test";
import { runCampusTests } from "./campus.test";
import { runPerfTests } from "./perf.test";

async function main() {
  console.log("=================================================");
  console.log("🚀 FORFH V4 COMPREHENSIVE PRODUCTION TEST SUITE");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    await runAuthTests(assert);
    await runCrossUserTests(assert);
    await runAITests(assert);
    await runDriveTests(assert);
    await runPasalTests(assert);
    await runReminderTests(assert);
    await runCampusTests(assert);
    await runPerfTests(assert);
  } catch (err) {
    console.error("Critical test execution failure:", err);
    process.exit(1);
  }

  console.log("\n=================================================");
  console.log(`📊 FINAL TEST REPORT: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled test runner error:", err);
  process.exit(1);
});
