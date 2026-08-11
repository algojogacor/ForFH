import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date object or ISO string in Indonesian locale (id-ID)
 */
export function formatDateIndonesian(
  dateInput: Date | string | number | null | undefined,
  includeTime: boolean = false
): string {
  if (!dateInput) return "-";
  const date = typeof dateInput === "string" || typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "-";

  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : {}),
  };

  return new Intl.DateTimeFormat("id-ID", options).format(date);
}

/**
 * Format time in 24-hour format (e.g. 08:30)
 */
export function formatTime24(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return "--:--";
  const date = typeof dateInput === "string" || typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Get friendly human countdown in Indonesian (e.g., "1 jam 24 menit lagi", "2 hari lagi", "Terlambat 3 jam")
 */
export function formatRelativeTimeIndonesian(targetDate: Date | string | number | null | undefined): {
  text: string;
  isOverdue: boolean;
  minutesRemaining: number;
} {
  if (!targetDate) {
    return { text: "-", isOverdue: false, minutesRemaining: 0 };
  }

  const target = typeof targetDate === "string" || typeof targetDate === "number" ? new Date(targetDate) : targetDate;
  if (isNaN(target.getTime())) {
    return { text: "-", isOverdue: false, minutesRemaining: 0 };
  }

  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const isOverdue = diffMs < 0;
  const absDiffMs = Math.abs(diffMs);

  const diffMinutes = Math.floor(absDiffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let text = "";
  if (isOverdue) {
    if (diffDays > 0) {
      text = `Terlambat ${diffDays} hari`;
    } else if (diffHours > 0) {
      text = `Terlambat ${diffHours} jam`;
    } else {
      text = `Terlambat ${Math.max(1, diffMinutes)} menit`;
    }
  } else {
    if (diffDays > 1) {
      text = `${diffDays} hari lagi`;
    } else if (diffDays === 1) {
      text = "Besok";
    } else if (diffHours > 0) {
      const remainingMins = diffMinutes % 60;
      text = remainingMins > 0 ? `${diffHours} jam ${remainingMins} menit lagi` : `${diffHours} jam lagi`;
    } else if (diffMinutes > 0) {
      text = `${diffMinutes} menit lagi`;
    } else {
      text = "Sekarang";
    }
  }

  return {
    text,
    isOverdue,
    minutesRemaining: Math.floor(diffMs / (1000 * 60)),
  };
}

/**
 * Days of the week in Indonesian (0 = Minggu, 1 = Senin, ..., 6 = Sabtu)
 */
export const INDONESIAN_DAYS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

export const INDONESIAN_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export function getIndonesianDayName(dayIndex: number): string {
  return INDONESIAN_DAYS[dayIndex % 7] || "Senin";
}
