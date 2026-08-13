"use client";

import React, { useState, useEffect } from "react";
import { Plus, Loader2, Check } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { ExamCard } from "@/components/exams/ExamCard";
import { ExamFormModal } from "@/components/exams/ExamFormModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { invalidateClientCache } from "@/lib/client-cache";

export default function ExamsPage() {
  const { toast, success } = useToast();
  const [exams, setExams] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // AI Study Roadmap Modal State
  const [roadmapModalOpen, setRoadmapModalOpen] = useState(false);
  const [selectedExamForRoadmap, setSelectedExamForRoadmap] = useState<any>(null);
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
  const [roadmap, setRoadmap] = useState<any>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [examsRes, coursesRes] = await Promise.all([
        fetch("/api/exams").then((r) => r.json()),
        fetch("/api/courses").then((r) => r.json()),
      ]);
      setExams(examsRes.exams || []);
      setCourses(coursesRes.courses || []);
    } catch (err) {
      console.error("Failed to load exams:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleTopic = async (topicId: string, currentCompleted: number) => {
    try {
      await fetch(`/api/exams/topic/patch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, completed: currentCompleted === 0 }),
      });
      invalidateClientCache();
      fetchData();
    } catch (err) {
      fetchData();
    }
  };

  const handleAddTopic = async (examId: string, title: string) => {
    try {
      await fetch(`/api/exams/${examId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      invalidateClientCache();
      fetchData();
    } catch (err) {
      toast("Gagal menambahkan topik.");
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (!confirm("Hapus jadwal ujian ini?")) return;
    try {
      await fetch(`/api/exams/${examId}`, { method: "DELETE" });
      invalidateClientCache();
      success("Jadwal ujian berhasil dihapus.");
      fetchData();
    } catch (err) {
      toast("Gagal menghapus ujian.");
    }
  };

  const handleOpenStudyRoadmap = (exam: any) => {
    setSelectedExamForRoadmap(exam);
    setRoadmap(null);
    setRoadmapModalOpen(true);
  };

  const handleGenerateRoadmap = async () => {
    if (!selectedExamForRoadmap) return;
    setIsGeneratingRoadmap(true);
    try {
      const res = await fetch("/api/ai/study-roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examName: selectedExamForRoadmap.name,
          examAt: selectedExamForRoadmap.examAt,
          courseName: selectedExamForRoadmap.course?.name,
          topics: selectedExamForRoadmap.topics?.map((t: any) => t.title) || [],
        }),
      });

      const data = await res.json();
      if (data.roadmap) {
        setRoadmap(data.roadmap);
      }
    } catch (err) {
      toast("Gagal menghasilkan roadmap belajar AI.");
    } finally {
      setIsGeneratingRoadmap(false);
    }
  };

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Persiapan Ujian Semester"
          description="Hitung mundur UTS/UAS, checklist materi yang harus dikuasai, dan roadmap belajar."
          metadata={`${exams.length} ujian terdaftar`}
          action={
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 rounded-md shadow-xs transition-colors select-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Ujian</span>
            </button>
          }
        />

        {exams.length === 0 && !isLoading ? (
          <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-6 space-y-2">
            <p className="text-foreground font-medium">Belum ada jadwal ujian semester.</p>
            <p className="text-muted-foreground">
              Tambahkan jadwal UTS atau UAS untuk memantau sisa hari belajar dan daftar topik materi.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 rounded-md shadow-xs transition-colors mt-2"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Ujian Pertama</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {exams.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                onToggleTopic={handleToggleTopic}
                onAddTopic={handleAddTopic}
                onDeleteExam={handleDeleteExam}
                onOpenStudyRoadmap={handleOpenStudyRoadmap}
              />
            ))}
          </div>
        )}

        <ExamFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          courses={courses}
          onSaved={fetchData}
        />

        {/* AI Study Roadmap Dialog */}
        <Dialog open={roadmapModalOpen} onOpenChange={setRoadmapModalOpen}>
          <DialogContent maxWidth="max-w-lg">
            <DialogHeader>
              <DialogTitle>Roadmap Belajar Ujian</DialogTitle>
              <DialogDescription>
                Rencana sesi belajar bertahap berdasarkan topik materi ujian.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs my-1">
              <div className="p-3 rounded-md bg-secondary/50 border border-border-default space-y-0.5">
                <p className="font-semibold text-foreground">{selectedExamForRoadmap?.name}</p>
                <p className="text-muted-foreground font-mono">
                  Mata Kuliah: {selectedExamForRoadmap?.course?.name || "Umum"}
                </p>
              </div>

              {!roadmap ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-muted-foreground">
                    Susun jadwal sesi belajar intensif berdasarkan topik materi.
                  </p>
                  <button
                    onClick={handleGenerateRoadmap}
                    disabled={isGeneratingRoadmap}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition-opacity shadow-xs disabled:opacity-50"
                  >
                    {isGeneratingRoadmap && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Susun Roadmap Belajar</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  <div className="p-3 rounded-md bg-surface-2 border border-border-default space-y-0.5">
                    <strong className="text-foreground">Strategi Review:</strong>{" "}
                    <span className="text-muted-foreground leading-relaxed">{roadmap.strategy}</span>
                  </div>

                  <div className="space-y-1.5">
                    {roadmap.sessions?.map((s: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-md bg-surface-1 border border-border-default space-y-0.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground font-mono">{s.dayLabel}</span>
                          <span className="text-muted-foreground font-mono text-[11px]">{s.durationMinutes}m</span>
                        </div>
                        <p className="font-medium text-foreground">{s.topicFocus}</p>
                        <p className="text-muted-foreground text-[11px] leading-relaxed">{s.studyMethod}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </AppShell>
  );
}
