"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Trash2, Check, Bell, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { INDONESIAN_DAYS } from "@/lib/utils";

export default function OnboardingPage() {
  const router = useRouter();
  const { success, toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Academic Profile & Term
  const [termName, setTermName] = useState("Semester Ganjil 2026/2027");
  const [university, setUniversity] = useState("");
  const [faculty, setFaculty] = useState("Fakultas Hukum");

  // Step 2: Course Setup (With Interactive Editable SKS 1..6)
  const [coursesList, setCoursesList] = useState<
    Array<{ name: string; code: string; credits: number; lecturer: string }>
  >([
    { name: "Pengantar Ilmu Hukum", code: "PIH101", credits: 3, lecturer: "" },
    { name: "Hukum Pidana", code: "HKP201", credits: 3, lecturer: "" },
    { name: "Hukum Perdata", code: "HKD201", credits: 3, lecturer: "" },
    { name: "Hukum Tata Negara", code: "HTN201", credits: 3, lecturer: "" },
  ]);

  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseCredits, setNewCourseCredits] = useState<number>(3);

  // Step 3: Schedules Allocation
  const [schedulesList, setSchedulesList] = useState<
    Array<{ courseName: string; dayOfWeek: number; startTime: string; endTime: string; room: string }>
  >([
    { courseName: "Pengantar Ilmu Hukum", dayOfWeek: 1, startTime: "08:00", endTime: "09:40", room: "101" },
    { courseName: "Hukum Pidana", dayOfWeek: 2, startTime: "08:00", endTime: "09:40", room: "304" },
    { courseName: "Hukum Perdata", dayOfWeek: 3, startTime: "10:00", endTime: "11:40", room: "201" },
    { courseName: "Hukum Tata Negara", dayOfWeek: 4, startTime: "13:00", endTime: "14:40", room: "302" },
  ]);

  const handleAddCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;

    const newCourse = {
      name: newCourseName.trim(),
      code: newCourseCode.trim() || `MK${coursesList.length + 101}`,
      credits: Number(newCourseCredits) || 3,
      lecturer: "",
    };

    setCoursesList((prev) => [...prev, newCourse]);

    // Auto-allocate schedule slot
    const nextDay = (coursesList.length % 5) + 1;
    setSchedulesList((prev) => [
      ...prev,
      {
        courseName: newCourse.name,
        dayOfWeek: nextDay,
        startTime: "08:00",
        endTime: newCourse.credits >= 3 ? "10:30" : "09:40",
        room: "101",
      },
    ]);

    setNewCourseName("");
    setNewCourseCode("");
    setNewCourseCredits(3);
  };

  const handleUpdateCredits = (index: number, credits: number) => {
    setCoursesList((prev) =>
      prev.map((c, i) => (i === index ? { ...c, credits } : c))
    );
  };

  const handleRemoveCourse = (index: number) => {
    const courseToRemove = coursesList[index];
    setCoursesList((prev) => prev.filter((_, i) => i !== index));
    if (courseToRemove) {
      setSchedulesList((prev) => prev.filter((s) => s.courseName !== courseToRemove.name));
    }
  };

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        success("Izin notifikasi Web Push aktif.");
      }
    }
  };

  const finishOnboarding = async () => {
    setIsSubmitting(true);
    try {
      let termId: string | null = null;
      if (termName.trim()) {
        try {
          const termRes = await fetch("/api/terms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: termName.trim(), isActive: true }),
          });
          const termData = await termRes.json();
          termId = termData?.termId || null;
        } catch (e) {
          console.error("Failed to create term:", e);
        }
      }

      for (const c of coursesList) {
        const courseRes = await fetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...c, academicTermId: termId }),
        });
        const courseData = await courseRes.json();

        const matchingSchedules = schedulesList.filter((s) => s.courseName === c.name);
        for (const s of matchingSchedules) {
          if (courseData.courseId) {
            await fetch("/api/schedules", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                courseId: courseData.courseId,
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                room: s.room || null,
              }),
            });
          }
        }
      }

      success("Setup workspace ForFH selesai.");
      router.push("/");
      router.refresh();
    } catch (err) {
      router.push("/");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalSks = coursesList.reduce((acc, c) => acc + (Number(c.credits) || 0), 0);

  return (
    <main className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 bg-canvas text-foreground">
      <div className="w-full max-w-lg space-y-6">
        {/* Onboarding Header */}
        <div className="text-center space-y-1">
          <div className="font-editorial italic text-2xl font-normal tracking-tight text-foreground">
            ForFH
          </div>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-mono">
            <span>Langkah {step} dari 4</span>
            <span>·</span>
            <span>
              {step === 1 && "Profil Semester"}
              {step === 2 && "Daftar Mata Kuliah"}
              {step === 3 && "Jadwal Kuliah"}
              {step === 4 && "Konfirmasi"}
            </span>
          </div>
        </div>

        {/* Step 1: Semester & Profile */}
        {step === 1 && (
          <div className="border border-border-default rounded-lg bg-surface-1 p-6 space-y-4 shadow-xs animate-fade-in text-xs">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Profil & Semester Akademik</h2>
              <p className="text-muted-foreground text-xs">
                Tentukan nama semester aktif dan institusi pendidikan Anda.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Nama Semester Aktif *
                </label>
                <input
                  type="text"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  placeholder="e.g. Semester Ganjil 2026/2027"
                  className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Fakultas / Program Studi
                  </label>
                  <input
                    type="text"
                    value={faculty}
                    onChange={(e) => setFaculty(e.target.value)}
                    placeholder="e.g. Fakultas Hukum"
                    className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Universitas / Kampus
                  </label>
                  <input
                    type="text"
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    placeholder="e.g. Universitas Indonesia"
                    className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-border-default">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shadow-xs"
              >
                <span>Lanjut ke Mata Kuliah</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Course Setup with Fully Editable SKS */}
        {step === 2 && (
          <div className="border border-border-default rounded-lg bg-surface-1 p-6 space-y-4 shadow-xs animate-fade-in text-xs">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-foreground">Setup Mata Kuliah</h2>
                <p className="text-muted-foreground text-[11px]">
                  Ubah SKS atau tambahkan mata kuliah baru.
                </p>
              </div>
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-secondary text-foreground border border-border-default">
                Total: {totalSks} SKS
              </span>
            </div>

            {/* Courses High Density Table */}
            <div className="border border-border-default rounded-md overflow-hidden divide-y divide-border-subtle bg-surface-1">
              {coursesList.map((c, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground text-xs truncate block">
                      {c.name}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {c.code}
                    </span>
                  </div>

                  {/* Fully Interactive SKS Selector (1 to 6 SKS) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label className="text-[11px] font-mono text-muted-foreground">SKS:</label>
                    <select
                      value={c.credits}
                      onChange={(e) => handleUpdateCredits(idx, Number(e.target.value))}
                      className="h-7 bg-surface-2 border border-border-default rounded px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value={1}>1 SKS</option>
                      <option value={2}>2 SKS</option>
                      <option value={3}>3 SKS</option>
                      <option value={4}>4 SKS</option>
                      <option value={5}>5 SKS</option>
                      <option value={6}>6 SKS</option>
                    </select>

                    <button
                      onClick={() => handleRemoveCourse(idx)}
                      className="p-1 rounded text-muted-foreground hover:text-status-danger hover:bg-status-danger-subtle transition-colors"
                      title="Hapus MK"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Course Form */}
            <form onSubmit={handleAddCourse} className="p-3 rounded-md bg-secondary/40 border border-border-default space-y-2">
              <span className="text-[11px] font-mono text-muted-foreground uppercase">
                Tambah Mata Kuliah Baru:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  placeholder="Nama Mata Kuliah"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="sm:col-span-2 bg-surface-1 border border-border-default rounded px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                />
                <input
                  type="text"
                  placeholder="Kode MK"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  className="bg-surface-1 border border-border-default rounded px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
                <select
                  value={newCourseCredits}
                  onChange={(e) => setNewCourseCredits(Number(e.target.value))}
                  className="bg-surface-1 border border-border-default rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value={1}>1 SKS</option>
                  <option value={2}>2 SKS</option>
                  <option value={3}>3 SKS</option>
                  <option value={4}>4 SKS</option>
                  <option value={5}>5 SKS</option>
                  <option value={6}>6 SKS</option>
                </select>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={!newCourseName.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded bg-secondary text-foreground hover:bg-surface-3 border border-border-default text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  <span>Tambah MK</span>
                </button>
              </div>
            </form>

            <div className="flex items-center justify-between pt-3 border-t border-border-default">
              <button
                onClick={() => setStep(1)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shadow-xs"
              >
                <span>Lanjut ke Jadwal</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Schedules */}
        {step === 3 && (
          <div className="border border-border-default rounded-lg bg-surface-1 p-6 space-y-4 shadow-xs animate-fade-in text-xs">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-foreground">Jadwal Perkuliahan</h2>
              <p className="text-muted-foreground text-[11px]">
                Waktu dan ruang kuliah untuk tiap mata kuliah.
              </p>
            </div>

            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 border border-border-default rounded-md p-2 bg-surface-1">
              {schedulesList.map((s, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-secondary/50 border border-border-default flex items-center justify-between text-xs font-mono"
                >
                  <div>
                    <p className="font-semibold text-foreground font-sans">{s.courseName}</p>
                    <p className="text-muted-foreground text-[11px] mt-0.5">
                      {INDONESIAN_DAYS[s.dayOfWeek]}, {s.startTime} – {s.endTime} · Ruang {s.room}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border-default">
              <button
                onClick={() => setStep(2)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shadow-xs"
              >
                <span>Lanjut ke Notifikasi</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Web Push & Complete */}
        {step === 4 && (
          <div className="border border-border-default rounded-lg bg-surface-1 p-6 text-center space-y-4 shadow-xs animate-fade-in text-xs">
            <div className="h-10 w-10 rounded bg-secondary text-foreground flex items-center justify-center mx-auto">
              <Bell className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Pengingat & Notifikasi</h2>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Notifikasi Web Push dikirim sebelum jadwal kuliah dan deadline tugas.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={requestNotificationPermission}
                className="w-full py-2 px-3 rounded-md border border-border-default bg-surface-1 hover:bg-surface-2 text-xs font-medium text-foreground transition-colors"
              >
                Aktifkan Notifikasi Browser
              </button>
              <button
                onClick={finishOnboarding}
                disabled={isSubmitting}
                className="w-full py-2 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shadow-xs flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>Selesai & Buka Dashboard</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
