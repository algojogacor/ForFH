// Helper normalisasi respons API Kampus Kita (konvensi field UPPERCASE_SNAKE
// dari libapp.so). Kk_lite memakai pola yang sama — ambil nilai field pertama
// yang ada, dan ratakan bentuk respons apa pun jadi daftar baris.

export const HARI_ID: Record<string, string> = {
  Monday: "Senin",
  Tuesday: "Selasa",
  Wednesday: "Rabu",
  Thursday: "Kamis",
  Friday: "Jumat",
  Saturday: "Sabtu",
  Sunday: "Minggu",
};

export function pick(d: Record<string, unknown> | undefined, keys: string[]): string {
  if (!d) return "";
  for (const k of keys) {
    const v = d[k];
    if (v !== undefined && v !== null && v !== "" && v !== "null") {
      return String(v);
    }
  }
  return "";
}

export function rowsFrom(j: unknown): Record<string, unknown>[] {
  if (Array.isArray(j)) {
    const out: Record<string, unknown>[] = [];
    for (const r of j) {
      if (!r || typeof r !== "object") continue;
      const rec = r as Record<string, unknown>;
      // jadwal-kuliah: [{"Senin":[...]}, ...] — flatten per hari
      if (Object.keys(rec).length > 0 && Object.values(rec).every((v) => Array.isArray(v))) {
        for (const lst of Object.values(rec)) {
          out.push(...(lst as Record<string, unknown>[]).filter((x) => x && typeof x === "object"));
        }
      } else {
        out.push(rec);
      }
    }
    return out;
  }
  if (j && typeof j === "object") {
    for (const k of ["data", "result", "jadwal", "rows", "list", "data_jadwal", "data_presensi", "jadwal_kuliah"]) {
      const v = (j as Record<string, unknown>)[k];
      if (Array.isArray(v)) return rowsFrom(v);
      if (v && typeof v === "object" && Object.values(v as Record<string, unknown>).every((x) => Array.isArray(x))) {
        return rowsFrom(Object.values(v as Record<string, unknown>));
      }
    }
  }
  return [];
}
