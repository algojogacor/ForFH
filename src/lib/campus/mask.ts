// Tampilkan email terblur untuk status (mis. "ary***@student.unair.ac.id").
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email.slice(0, 3) + "***";
  return email.slice(0, 3) + "***" + email.slice(at);
}
