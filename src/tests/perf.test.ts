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

  // --- Subtask Bulk Insert Builder Validation ---
  const initialSubtasks = [
    { title: " Subtask 1 ", estimatedMinutes: 15 },
    { title: "Subtask 2" },
    { title: "" }, // empty title
    null,
    { title: "Subtask 3", estimatedMinutes: 30 },
  ];

  let order = 1;
  const subtaskValues = [];
  const taskId = "test-task-id";
  const userId = "test-user-id";
  const now = new Date();

  for (const sub of initialSubtasks) {
    if (sub && sub.title) {
      subtaskValues.push({
        id: "mock-uuid-" + order,
        userId,
        taskId,
        title: sub.title.trim(),
        completed: 0,
        orderIndex: order++,
        estimatedMinutes: sub.estimatedMinutes || null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  assert(subtaskValues.length === 3, "Subtask bulk insert filters invalid subtasks correctly");
  assert(subtaskValues[0].title === "Subtask 1", "Subtask title is trimmed");
  assert(subtaskValues[0].orderIndex === 1, "Subtask 1 has orderIndex 1");
  assert(subtaskValues[1].orderIndex === 2, "Subtask 2 has orderIndex 2");
  assert(subtaskValues[2].orderIndex === 3, "Subtask 3 has orderIndex 3");
  assert(subtaskValues[2].estimatedMinutes === 30, "Subtask estimatedMinutes preserved");
}
