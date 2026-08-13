"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckSquare,
  FileText,
  BookOpen,
  Calendar,
  UserCheck,
  Award,
  FolderLock,
  Scale,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { TaskCard } from "@/components/tasks/TaskCard";
import { NoteCard } from "@/components/notes/NoteCard";
import { ReadingCard } from "@/components/readings/ReadingCard";
import { ExamCard } from "@/components/exams/ExamCard";
import { invalidateClientCache } from "@/lib/client-cache";

export default function CourseHubPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;

  const [hubData, setHubData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHubData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (!res.ok) {
        router.push("/mata-kuliah");
        return;
      }
      const data = await res.json();
      setHubData(data);
    } catch (err) {
      console.error("Failed to load Course Hub:", err);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, router]);

  useEffect(() => {
    if (courseId) {
      fetchHubData();
    }
  }, [courseId, fetchHubData]);

  if (isLoading || !hubData) {
    return (
      <AppShell>
        <div className="py-20 text-center text-xs text-muted-foreground">
          Memuat data mata kuliah...
        </div>
      </AppShell>
    );
  }

  const {
    course,
    tasks = [],
    notes = [],
    readings = [],
    exams = [],
    attendance = [],
    grades = [],
    files = [],
    legalBookmarks = [],
  } = hubData;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        {/* Navigation & Header */}
        <div className="space-y-3 pb-3 border-b border-border/60">
          <button
            onClick={() => router.push("/mata-kuliah")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Daftar Mata Kuliah</span>
          </button>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground tracking-tight">
                  {course.name}
                </h1>
                <span className="font-mono text-xs text-muted-foreground">
                  {course.code || "Tanpa Kode"} · {course.credits || 2} SKS
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                {course.lecturer && <span>Dosen: {course.lecturer}</span>}
                {course.defaultRoom && <span>· Ruang {course.defaultRoom}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 8 Course Subtabs */}
        <Tabs defaultValue="tugas">
          <TabsList className="flex flex-wrap gap-1 border-b border-border/60 pb-1 mb-4">
            <TabsTrigger value="tugas" className="text-xs">
              Tugas ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="catatan" className="text-xs">
              Catatan ({notes.length})
            </TabsTrigger>
            <TabsTrigger value="bacaan" className="text-xs">
              Bacaan ({readings.length})
            </TabsTrigger>
            <TabsTrigger value="hukum" className="text-xs">
              Pasal & Riset ({legalBookmarks.length})
            </TabsTrigger>
            <TabsTrigger value="ujian" className="text-xs">
              Ujian ({exams.length})
            </TabsTrigger>
            <TabsTrigger value="kehadiran" className="text-xs">
              Kehadiran ({attendance.length})
            </TabsTrigger>
            <TabsTrigger value="nilai" className="text-xs">
              Nilai ({grades.length})
            </TabsTrigger>
            <TabsTrigger value="berkas" className="text-xs">
              Berkas ({files.length})
            </TabsTrigger>
          </TabsList>

          {/* Tugas Tab */}
          <TabsContent value="tugas" className="space-y-3">
            {tasks.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg p-6">
                Belum ada tugas untuk mata kuliah ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tasks.map((t: any) => (
                  <TaskCard
                    key={t.id}
                    task={{ ...t, course }}
                    onTaskUpdated={fetchHubData}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Catatan Tab */}
          <TabsContent value="catatan" className="space-y-3">
            {notes.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg p-6">
                Belum ada catatan kuliah.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {notes.map((n: any) => (
                  <NoteCard
                    key={n.id}
                    note={{ ...n, course }}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Bacaan Tab */}
          <TabsContent value="bacaan" className="space-y-3">
            {readings.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg p-6">
                Belum ada bahan bacaan.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {readings.map((r: any) => (
                  <ReadingCard
                    key={r.id}
                    reading={{ ...r, course }}
                    onUpdateProgress={async (rId, newPage) => {
                      await fetch(`/api/readings/${rId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ currentPage: newPage }),
                      });
                      fetchHubData();
                    }}
                    onDelete={async (rId) => {
                      await fetch(`/api/readings/${rId}`, { method: "DELETE" });
                      fetchHubData();
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Riset Hukum Bookmarks Tab */}
          <TabsContent value="hukum" className="space-y-3">
            {legalBookmarks.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg p-6">
                Belum ada pasal perundang-undangan yang disematkan ke mata kuliah ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {legalBookmarks.map((b: any) => (
                  <div key={b.id} className="p-3.5 rounded-lg border border-border bg-card space-y-1 text-xs">
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {b.type || "UU"} {b.number ? `No. ${b.number}` : ""} {b.year ? `Tahun ${b.year}` : ""}
                    </div>
                    <div className="font-medium text-foreground">{b.title}</div>
                    {b.userNote && (
                      <p className="text-muted-foreground mt-1 bg-muted/20 p-2 rounded text-[11px]">
                        {b.userNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Ujian Tab */}
          <TabsContent value="ujian" className="space-y-3">
            {exams.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg p-6">
                Belum ada jadwal UTS/UAS untuk mata kuliah ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {exams.map((e: any) => (
                  <ExamCard
                    key={e.id}
                    exam={{ ...e, course }}
                    onToggleTopic={async (tId, curr) => {
                      await fetch(`/api/exams/${e.id}/topics`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ topicId: tId, completed: curr === 0 }),
                      });
                      invalidateClientCache();
                      fetchHubData();
                    }}
                    onAddTopic={async (eId, title) => {
                      await fetch(`/api/exams/${eId}/topics`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title }),
                      });
                      invalidateClientCache();
                      fetchHubData();
                    }}
                    onDeleteExam={async (eId) => {
                      await fetch(`/api/exams/${eId}`, { method: "DELETE" });
                      invalidateClientCache();
                      fetchHubData();
                    }}
                    onOpenStudyRoadmap={() => {}}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Kehadiran Tab */}
          <TabsContent value="kehadiran" className="space-y-3">
            {attendance.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg p-6">
                Belum ada riwayat presensi.
              </div>
            ) : (
              <div className="border border-border/70 rounded-lg overflow-hidden bg-card divide-y divide-border/40 text-xs">
                {attendance.map((a: any) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3"
                  >
                    <span className="font-medium text-foreground">
                      Pertemuan Tanggal: {a.classDate}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Nilai Tab */}
          <TabsContent value="nilai" className="space-y-3">
            {grades.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg p-6">
                Belum ada komponen nilai yang dicatat.
              </div>
            ) : (
              <div className="border border-border/70 rounded-lg overflow-hidden bg-card divide-y divide-border/40 text-xs">
                {grades.map((g: any) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-3"
                  >
                    <div>
                      <span className="font-medium text-foreground">{g.componentName}</span>
                      <span className="text-muted-foreground text-xs ml-2 font-mono">
                        (Bobot: {g.weight}%)
                      </span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {g.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Berkas Tab */}
          <TabsContent value="berkas" className="space-y-3">
            {files.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg p-6">
                Belum ada berkas lampiran untuk mata kuliah ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {files.map((f: any) => (
                  <div key={f.id} className="p-3 rounded-lg border border-border bg-card text-xs">
                    <p className="font-medium text-foreground truncate">{f.name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                      {(f.sizeBytes / (1024 * 1024)).toFixed(2)} MB · {f.category}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
