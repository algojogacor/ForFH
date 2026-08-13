// src/lib/wa/commands.ts — parser + dispatcher (C3). Dispatcher dibangun di
// Task 5 setelah executors ada; parser + meta 100% pure.
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { executeJadwal } from "./executors/jadwal";
import { executeTugas } from "./executors/tugas";
import { executeSelesai } from "./executors/selesai";
import { executeNilai } from "./executors/nilai";
import { executeInsight } from "./executors/insight";
import { executePutuskan } from "./executors/putuskan";
import { formatHelp, formatNotLinked } from "./format";

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

export interface CommandExecutorDeps {
  jadwal: (userId: string, args: string) => Promise<string>;
  tugas: (userId: string, args: string) => Promise<string>;
  selesai: (userId: string, args: string) => Promise<string>;
  nilai: (userId: string) => Promise<string>;
  insight: (userId: string) => Promise<string>;
  hubungkan: (userId: string) => Promise<string>;
  putuskan: (userId: string, args: string) => Promise<string>;
  help: (long: boolean) => string;
}

/** Dispatcher C3: perintah dikenal → executor; unknown → !help singkat. */
export async function dispatchCommand(cmd: WaCommand, args: string, deps: CommandExecutorDeps): Promise<string> {
  switch (cmd) {
    case "hubungkan": return deps.hubungkan("");
    case "jadwal": return deps.jadwal("", args);
    case "tugas": return deps.tugas("", args);
    case "selesai": return deps.selesai("", args);
    case "nilai": return deps.nilai("");
    case "insight": return deps.insight("");
    case "putuskan": return deps.putuskan("", args);
    case "menu":
    case "help":
      return deps.help(true);
    default:
      return deps.help(false); // unknown → !help singkat
  }
}

/** Deps produksi terikat userId. !hubungkan cek status binding user. */
export function buildExecutorDeps(userId: string): CommandExecutorDeps {
  return {
    jadwal: (_u, args) => executeJadwal(userId, args),
    tugas: (_u, args) => executeTugas(userId, args),
    selesai: (_u, args) => executeSelesai(userId, args),
    nilai: (_u) => executeNilai(userId),
    insight: (_u) => executeInsight(userId),
    hubungkan: async (_u) => {
      const binding = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, userId) });
      if (binding?.status === "active") return `Kamu sudah terhubung dengan nomor ${binding.phone.slice(0, 3)}****${binding.phone.slice(-2)}. Ketik !putuskan utk memutuskan.`;
      return formatNotLinked(null);
    },
    putuskan: (_u, args) => executePutuskan(userId, args),
    help: (long) => formatHelp(long),
  };
}
