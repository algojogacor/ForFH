// Tes murni (tanpa DB, tanpa jaringan) untuk lapisan sinkronisasi kampus:
// enkripsi at-rest, client HE-BAT (parse iCal), dan pemetaan Kampus Kita.
import { encryptText, decryptText, maskEmail } from "../lib/crypto/at-rest";
import { parseIcs } from "../lib/campus/hebat";
import {
  icsTimestampToMs,
  normalizeTime,
  dayOfWeekFromId,
  gradePointFromLetter,
  courseFromCategories,
  titleFromSummary,
  icsToTask,
  jadwalToSchedules,
  khsToGrades,
} from "../lib/campus/mappings";

// Fixture iCal nyata dari kalender HE-BAT (2 event: tugas Assessment HAM +
// event tambahan), bidang folded line agar parser diuji juga.
const FIXTURE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Moodle//NONSGML Moodle Calendar//EN
BEGIN:VEVENT
UID:71902@hebat.elearning.unair.ac.id
DTSTART:20260814T050000Z
DTEND:20260814T051500Z
SUMMARY:Assessment Hak Asasi Manusia is due
DESCRIPTION:Tugas individu (uraian di Moodle).
CATEGORIES:2026Ganjil - FHK25601032 - Hak Asasi Manusia - S1 - Ilmu Hukum
 -
END:VEVENT
BEGIN:VEVENT
UID:71905@hebat.elearning.unair.ac.id
DTSTART:20260820T230000Z
SUMMARY:Kuis Hukum Acara Pidana is due
CATEGORIES:2026Ganjil - FHK25601033 - Hukum Acara Pidana - S1 - Ilmu Hukum
 -
END:VEVENT
END:VCALENDAR
`;

export async function runCampusTests(assert: (condition: boolean, name: string) => void) {
  console.log("  ── Campus sync (enkripsi at-rest) ──");
  const plain = "eyJhbGciOiJIUzI1NiJ9.rahasia-token";
  const enc = encryptText(plain);
  assert(enc.startsWith("v1:"), "format rekaman v1:iv:tag:ct");
  assert(enc !== plain, "ciphertext berbeda dari plaintext");
  assert(decryptText(enc) === plain, "roundtrip decrypt mengembalikan plaintext");
  let threw = false;
  try {
    decryptText("v2:abcd");
  } catch {
    threw = true;
  }
  assert(threw, "payload format salah ditolak");
  assert(maskEmail("aryarizky@student.unair.ac.id") === "ary***@student.unair.ac.id", "maskEmail menyamarkan email");

  console.log("  ── Campus sync (parse iCal) ──");
  const events = parseIcs(FIXTURE_ICS);
  assert(events.length === 2, "2 event di-parse dari fixture iCal");
  const first = events[0];
  assert(first.UID === "71902@hebat.elearning.unair.ac.id", "UID event terbaca");
  assert(first.DTSTART === "20260814T050000Z", "DTSTART UTC terbaca");
  assert(first.SUMMARY === "Assessment Hak Asasi Manusia is due", "SUMMARY terbaca");
  assert(!!first.CATEGORIES && first.CATEGORIES.includes("FHK25601032"), "CATEGORIES mengandung kode MK");
  assert(!!first.DESCRIPTION && first.DESCRIPTION.length > 20, "DESCRIPTION folded line digabung");
  assert(!events[1].DTEND, "DTEND boleh kosong di event kedua");

  console.log("  ── Campus sync (mappings waktu) ──");
  assert(icsTimestampToMs("20260814T050000Z") === Date.UTC(2026, 7, 14, 5, 0, 0), "icsTimestampToMs UTC");
  assert(icsTimestampToMs("20260814T050000") === Date.UTC(2026, 7, 14, 5, 0, 0), "icsTimestampToMs tanpa Z");
  assert(icsTimestampToMs("bukan-waktu") === null, "icsTimestampToMs invalid -> null");
  assert(normalizeTime("8:00") === "08:00", "normalizeTime 8:00");
  assert(normalizeTime("08.30") === "08:30", "normalizeTime 08.30");
  assert(normalizeTime("xx") === "", "normalizeTime invalid -> kosong");
  assert(dayOfWeekFromId("Senin") === 1, "Senin = 1");
  assert(dayOfWeekFromId("Minggu") === 0, "Minggu = 0 (ForFH 0=Sunday)");
  assert(dayOfWeekFromId("Wednesday") === 3, "Wednesday = 3");
  assert(dayOfWeekFromId("Hari X") === null, "hari tidak dikenal -> null");
  assert(gradePointFromLetter("A") === 4, "A = 4.0");
  assert(gradePointFromLetter("B+") === 3.5, "B+ = 3.5");
  assert(gradePointFromLetter("a-") === 3.75, "a- (lowercase) = 3.75");
  assert(gradePointFromLetter("Q") === null, "huruf tak dikenal -> null");

  console.log("  ── Campus sync (pemetaan tugas iCal) ──");
  const task = icsToTask(first);
  assert(task.externalId === "71902@hebat.elearning.unair.ac.id", "externalId = UID");
  assert(task.title === "Assessment Hak Asasi Manusia", "title membuang ' is due'");
  assert(task.dueAt === Date.UTC(2026, 7, 14, 5, 0, 0), "dueAt dari DTSTART");
  assert(task.courseCode === "FHK25601032", "kode MK dari CATEGORIES");
  assert(task.courseName === "Hak Asasi Manusia", "nama MK dari CATEGORIES");
  assert(courseFromCategories(undefined).code === "", "CATEGORIES kosong -> tanpa kode");
  assert(titleFromSummary("UAS is due") === "UAS", "titleFromSummary membersihkan suffix");

  console.log("  ── Campus sync (jadwal-kuliah KK) ──");
  const jadwal = [
    { NM_JADWAL_HARI: "Senin", WAKTU_MULAI: "08:00", WAKTU_SELESAI: "09:40", NM_RUANGAN: "R 2.1", NM_GEDUNG: "Gedung A", KD_MATA_KULIAH: "FHK25601032", NM_MATA_KULIAH: "Hak Asasi Manusia", NM_DOSEN: "Dr. X", KREDIT_SEMESTER: "3", NAMA_KELAS: "A-1" },
    { NM_JADWAL_HARI: "Rabu", JAM: "13:00 - 15:00", NM_MATA_KULIAH: "Hukum Acara Pidana", SKS: "2" },
    { NM_JADWAL_HARI: "Minggu" }, // tanpa kode/nama -> dilewati
  ];
  const sched = jadwalToSchedules(jadwal as any);
  assert(sched.length === 2, "baris tanpa kode/nama dilewati");
  assert(sched[0].dayOfWeek === 1 && sched[0].startTime === "08:00" && sched[0].endTime === "09:40", "jadwal Senin ter-parse");
  assert(sched[0].room === "R 2.1 Gedung A", "ruang + gedung digabung");
  assert(sched[0].credits === 3, "SKS terbaca sebagai angka");
  assert(sched[1].startTime === "13:00" && sched[1].endTime === "15:00", "JAM '13:00 - 15:00' dipecah");
  assert(sched[1].dayOfWeek === 3, "Rabu = 3");
  assert(sched[0].externalId.startsWith("FHK25601032|Senin|08:00|09:40"), "externalId jadwal stabil");

  console.log("  ── Campus sync (riwayat-khs KK) ──");
  const khs = [
    { KD_MATA_KULIAH: "FHK25601032", NM_MATA_KULIAH: "Hak Asasi Manusia", NILAI: "87", NILAI_HURUF: "A", SKS: "3" },
    { KD_MATA_KULIAH: "FHK25601033", NM_MATA_KULIAH: "Hukum Acara Pidana", NILAI: "", NILAI_HURUF: "B", SKS: "2" },
  ];
  const grades = khsToGrades(khs as any, "2026/2027 Ganjil", "S20261");
  assert(grades.length === 2, "dua baris KHS dipetakan");
  assert(grades[0].componentName === "KHS 2026/2027 Ganjil", "componentName memuat label semester");
  assert(grades[0].score === 87 && grades[0].letterGrade === "A" && grades[0].gradePoint === 4, "skor + huruf + poin");
  assert(grades[0].externalId === "S20261|FHK25601032", "externalId semester|kode");
  assert(grades[1].score === null && grades[1].gradePoint === 3, "nilai kosong -> score null, poin tetap");
}
