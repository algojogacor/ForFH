// src/lib/wa/commands.ts — parser + dispatcher (C3). Dispatcher dibangun di
// Task 5 setelah executors ada; parser + meta 100% pure.
export type WaCommand =
  | "hubungkan" | "jadwal" | "tugas" | "selesai" | "nilai" | "insight"
  | "help" | "menu" | "putuskan" | "unknown";

export interface ParsedCommand { command: WaCommand; args: string; }

const KNOWN: Record<string, WaCommand> = {
  hubungkan: "hubungkan", jadwal: "jadwal", tugas: "tugas", selesai: "selesai",
  nilai: "nilai", insight: "insight", help: "help", menu: "menu", putuskan: "putuskan",
};

export function parseCommand(text: string): ParsedCommand {
  const trimmed = (text || "").trim();
  if (!trimmed.startsWith("!")) return { command: "unknown", args: "" };
  const [raw, ...rest] = trimmed.slice(1).split(/\s+/);
  const cmd = (raw ?? "").toLowerCase();
  return { command: KNOWN[cmd] ?? "unknown", args: rest.join(" ").trim() };
}
