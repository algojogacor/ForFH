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

  // --- (ai cache & rate limit butuh DB/network — diuji lewat E2E/manual) ---
}
