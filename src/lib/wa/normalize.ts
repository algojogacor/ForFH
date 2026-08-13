// src/lib/wa/normalize.ts — phone adalah verification/UI identity (B3);
// transport identity (lid/jid) ditangani resolver terpisah (C2/D2).
export function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  let normalized = digits;
  if (normalized.startsWith("0")) normalized = "62" + normalized.slice(1);
  else if (normalized.startsWith("8")) normalized = "62" + normalized;
  if (normalized.length < 10 || normalized.length > 15) return null;
  return normalized;
}

export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
}
