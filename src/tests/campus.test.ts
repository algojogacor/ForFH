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
  descriptionToText,
  icsToTask,
  jadwalToSchedules,
  khsToGrades,
  presensiToRecap,
  parseCoursePage,
  instructionFor,
} from "../lib/campus/mappings";
import { CAMPUS_DATA_JENIS } from "../lib/db/schema";

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

// Fixture halaman kursus HAM A-2 (tereduksi dari probe nyata): H1 fullname,
// section General tanpa summary/aktivitas, lalu section 1 dengan summarytext
// + 3 aktivitas. Struktur asli: <li id="section-..."> PEMBUKA diikuti header
// & activity-item DI DALAM blok section (bukan <li id="section-"> per aktivitas).
const FIXTURE_HAM = `<html><body>
<h1>2026Ganjil - FHK25601032 - Hak Asasi Manusia - S1 - Ilmu Hukum - 2025 - A-2</h1>
<ul class="course-section-list">
<li id="section-0" class="section course-section main clearfix" data-sectionid="0" data-for="section" data-id="69590" data-number="0" data-sectionname="General">
<div class="course-section-header"><h3 class="sectionname">General</h3></div>
</li>
<li id="section-1" class="section course-section main clearfix" data-sectionid="1" data-for="section" data-id="75968" data-number="1" data-sectionname="11 Agustus 2026: Assessment HAM">
<div class="course-section-header"><h3 class="sectionname">11 Agustus 2026: Assessment HAM</h3>
<div class="summarytext"><p>Mahasiswa yang saya hormati,</p><p>Silakan kerjakan <b>Assessment HAM</b>.</p></div>
</div>
<div class="activity-item focus-control " data-activityname="the story of human rights" data-region="activity-card"></div>
<div class="activity-item focus-control " data-activityname="Assessment HAM" data-region="activity-card"></div>
<div class="activity-item focus-control " data-activityname="what are human rights" data-region="activity-card"></div>
</li>
</ul>
</body></html>`;

// Fixture kursus PIH (C-2): satu section beraktivitas TANPA summarytext sama
// sekali — graceful: tugas tampil tanpa instruksi.
const FIXTURE_PIH = `<html><body>
<h1>2026Ganjil - FHK25601001 - Pengantar Ilmu Hukum - S1 - Ilmu Hukum - 2025 - C-2</h1>
<ul class="course-section-list">
<li id="section-2" class="section course-section main clearfix" data-sectionid="2" data-for="section" data-id="80497" data-number="2" data-sectionname="Pertemuan 2: Hakikat Ilmu Hukum">
<div class="course-section-header"><h3 class="sectionname">Pertemuan 2: Hakikat Ilmu Hukum</h3></div>
<div class="activity-item focus-control " data-activityname="Pengumpulan Tugas Resume Buku PIH Prof Peter Bab I" data-region="activity-card"></div>
</li>
</ul>
</body></html>`;

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

  console.log("  ── Campus sync (descriptionToText) ──");
  assert(
    descriptionToText("<p>Tugas 1: Baca bab 3</p><p>Kumpul Jumat.</p>") ===
      "Tugas 1: Baca bab 3\nKumpul Jumat.",
    "tag </p> jadi baris baru"
  );
  assert(
    descriptionToText("Baris 1<br>Baris 2<br/>Baris 3<br />X") === "Baris 1\nBaris 2\nBaris 3\nX",
    "varian <br> jadi newline"
  );
  assert(
    descriptionToText("A &amp; B &lt;C&gt; &quot;D&quot; &nbsp;E") === 'A & B <C> "D" E',
    "entity HTML didecode"
  );
  assert(descriptionToText("  Instruksi sederhana.  ") === "Instruksi sederhana.", "teks polos di-trim");
  assert(descriptionToText("") === "" && descriptionToText(undefined) === "", "kosong/undefined -> kosong");
  assert(descriptionToText("   \n ") === "", "whitespace saja -> kosong");
  assert(descriptionToText("A\n\n\n\nB") === "A\nB", "baris kosong ganda dipadatkan");
  assert(descriptionToText("a  b   c") === "a b c", "spasi ganda dipadatkan");
  assert(descriptionToText("a &amp;lt; b &amp;nbsp; c") === "a &lt; b &nbsp; c", "tanpa decode ganda entity");
  assert(descriptionToText("5 < 10 dan 3 > 1") === "5 < 10 dan 3 > 1", "teks polos < > tidak dibuang");
  assert(
    descriptionToText("Kuis &#8211; Bab 2 &#8220;Hukum&#8221; &#8230;") === "Kuis – Bab 2 “Hukum” …",
    "entity numerik non-ASCII didecode"
  );
  assert(descriptionToText("&#x27;petik&#x27;") === "'petik'", "entity numerik heksadesimal didecode");
  const longDesc = "x".repeat(2000);
  assert(descriptionToText(longDesc) === longDesc, "deskripsi panjang tidak dipotong (tanpa cap)");
  const htmlTask = icsToTask({
    UID: "x",
    SUMMARY: "Tugas X is due",
    DTSTART: "20260814T050000Z",
    DESCRIPTION: "<p>Instruksi <b>ber-html</b>.</p><br>Baris 2",
  });
  assert(htmlTask.description === "Instruksi ber-html.\nBaris 2", "icsToTask membersihkan HTML");

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

  console.log("  ── Campus sync (presensi-kuliah KK -> rekap) ──");
  const presensi = [
    { KD_MATA_KULIAH: "FHK25601032", NM_MATA_KULIAH: "Hak Asasi Manusia", TOTAL_TM: "14", JML_HADIR: "13", PERSEN: "93" },
    { kode_mk: "FHK25601033", nama_mk: "Hukum Acara Pidana", TM: "14", HADIR: "7" }, // tanpa PERSEN -> dihitung
    { KD_MATA_KULIAH: "FHK25601034", NM_MATA_KULIAH: "Metode Penelitian Hukum" }, // tanpa angka -> null
    { NM_JADWAL_HARI: "Senin" }, // tanpa kode/nama -> dilewati
  ];
  const recaps = presensiToRecap(presensi as any);
  assert(recaps.length === 3, "baris tanpa kode/nama dilewati");
  assert(recaps[0].code === "FHK25601032" && recaps[0].name === "Hak Asasi Manusia", "kode+nama ter-parse");
  assert(recaps[0].tm === 14 && recaps[0].hadir === 13 && recaps[0].persen === 93, "TM/hadir/persen lengkap");
  assert(recaps[1].persen === Math.round((7 / 14) * 100), "persen dihitung dari tm/hadir bila tidak ada");
  assert(recaps[1].persen === 50, "perhitungan dibulatkan (7/14 -> 50)");
  assert(recaps[2].tm === null && recaps[2].hadir === null && recaps[2].persen === null, "tanpa angka -> null");

  console.log("  ── Campus sync (instruksi tugas HE-BAT) ──");
  const ham = parseCoursePage(FIXTURE_HAM, "16332");
  assert(ham.courseId === "16332", "courseId dari argumen");
  assert(ham.shortname === "FHK25601032", "shortname = segmen ke-2 fullname H1");
  assert(ham.fullname.includes("Hak Asasi Manusia"), "fullname utuh dari H1");
  assert(ham.sections.length === 2, "dua section di-parse (General + Assessment)");
  assert(ham.sections[0].sectionId === "69590" && ham.sections[0].sectionName === "General", "section General terbaca");
  assert(ham.sections[0].summary === "" && ham.sections[0].assignments.length === 0, "General tanpa summary/aktivitas");
  assert(ham.sections[1].sectionId === "75968", "sectionId = data-id section 1");
  assert(ham.sections[1].sectionName.includes("Assessment HAM"), "sectionName dari data-sectionname");
  assert(ham.sections[1].summary.includes("Mahasiswa"), "summarytext section terbaca");
  assert(
    ham.sections[1].assignments.includes("Assessment HAM") && ham.sections[1].assignments.includes("the story of human rights"),
    "assignments dikumpulkan per section (urutan kemunculan)"
  );
  assert(ham.sections[1].assignments.length === 3, "tiga aktivitas dalam section 1");

  const pih = parseCoursePage(FIXTURE_PIH, "16319");
  assert(pih.sections.length === 1, "PIH satu section");
  assert(pih.sections[0].summary === "", "PIH tanpa summarytext -> summary kosong");
  assert(pih.sections[0].assignments[0] === "Pengumpulan Tugas Resume Buku PIH Prof Peter Bab I", "assignments PIH terbaca");

  const instrHam = instructionFor([ham], { courseCode: "FHK25601032", courseName: "Hak Asasi Manusia", title: "Assessment HAM" });
  assert(!!instrHam && instrHam.includes("Mahasiswa"), "cocok shortname + assignment -> instruksi");
  assert(!!instrHam && instrHam.includes("Silakan kerjakan"), "HTML summary dibersihkan jadi teks");
  assert(
    instructionFor([pih], { courseCode: "FHK25601001", courseName: "Pengantar Ilmu Hukum", title: "Pengumpulan Tugas Resume Buku PIH Prof Peter Bab I" }) === null,
    "summary kosong -> null (graceful)"
  );
  assert(
    instructionFor([ham], { courseCode: "XXX999", courseName: "Kursus Asing", title: "Assessment HAM" }) === null,
    "kursus tak dikenal -> null"
  );
  assert(
    !!instructionFor([ham], { courseCode: "FHK25601032", courseName: "Hak Asasi Manusia", title: "  assessment  ham " }),
    "case/whitespace beda tetap cocok (normalisasi)"
  );
  assert(instructionFor([], { courseCode: "FHK25601032", courseName: "Hak Asasi Manusia", title: "Assessment HAM" }) === null, "tanpa instruksi -> null");

  console.log("  ── Campus sync (jenis campus_data) ──");
  assert(CAMPUS_DATA_JENIS.length === 9, "9 jenis data kampus terdaftar");
  assert(new Set(CAMPUS_DATA_JENIS).size === 9, "jenis tidak duplikat");
  assert(CAMPUS_DATA_JENIS.includes("presensi") && CAMPUS_DATA_JENIS.includes("pembayaran"), "presensi + pembayaran terdaftar");
  assert(CAMPUS_DATA_JENIS.includes("instruksi_tugas"), "instruksi_tugas terdaftar");
}
