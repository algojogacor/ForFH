"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, ArrowLeft, Loader2, Check } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { NoteCard } from "@/components/notes/NoteCard";
import { MarkdownEditor } from "@/components/notes/MarkdownEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

export default function NotesPage() {
  const { toast, success } = useToast();
  const [notes, setNotes] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [activeNote, setActiveNote] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);

  // Form State for Active Note
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [courseId, setCourseId] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // AI Summary State
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<any>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [notesRes, coursesRes] = await Promise.all([
        fetch("/api/notes").then((r) => r.json()),
        fetch("/api/courses").then((r) => r.json()),
      ]);
      setNotes(notesRes.notes || []);
      setCourses(coursesRes.courses || []);
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenNewNote = () => {
    setActiveNote(null);
    setTitle("");
    setContent("");
    setCourseId("");
    setIsPinned(false);
    setIsEditing(true);
  };

  const handleSelectNote = (note: any) => {
    setActiveNote(note);
    setTitle(note.title);
    setContent(note.content || "");
    setCourseId(note.courseId || "");
    setIsPinned(note.pinned === 1);
    setIsEditing(true);
  };

  const handleSaveNote = async () => {
    if (!title.trim()) {
      toast("Judul catatan wajib diisi.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content,
        courseId: courseId || null,
        pinned: isPinned,
      };

      if (activeNote) {
        await fetch(`/api/notes/${activeNote.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        success("Catatan berhasil disimpan.");
      } else {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        setActiveNote(data.note);
        success("Catatan baru berhasil dibuat.");
      }

      fetchData();
    } catch (err) {
      toast("Gagal menyimpan catatan.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Hapus catatan ini?")) return;
    try {
      await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      success("Catatan berhasil dihapus.");
      if (activeNote?.id === noteId) {
        setIsEditing(false);
        setActiveNote(null);
      }
      fetchData();
    } catch (err) {
      toast("Gagal menghapus catatan.");
    }
  };

  const handleAiSummarize = async () => {
    if (!content.trim()) return;
    setIsSummarizing(true);
    try {
      const res = await fetch("/api/ai/summarize-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          courseName: courses.find((c) => c.id === courseId)?.name,
        }),
      });

      const data = await res.json();
      if (data.summary) {
        setAiSummary(data.summary);
        setSummaryModalOpen(true);
      }
    } catch (err) {
      toast("Gagal menghasilkan ringkasan AI.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const filteredNotes = notes.filter((n) => {
    if (searchQuery.trim()) {
      const match =
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.content && n.content.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!match) return false;
    }
    if (selectedCourseFilter !== "ALL" && n.courseId !== selectedCourseFilter) {
      return false;
    }
    return true;
  });

  return (
    <AppShell>
      <PageContainer variant={isEditing ? "reading" : "wide"}>
        {/* Header */}
        {!isEditing ? (
          <PageHeader
            title="Catatan Kuliah"
            editorial
            description="Catatan materi perkuliahan, doktrin hukum, dan ringkasan mandiri."
            metadata={`${notes.length} catatan tersimpan`}
            action={
              <button
                onClick={handleOpenNewNote}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-2 rounded-md shadow-xs transition-colors select-none"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tulis Catatan</span>
              </button>
            }
          />
        ) : null}

        {/* View Mode: Editor or Notes List */}
        {isEditing ? (
          <div className="space-y-4 animate-fade-in">
            {/* Editor Action Bar */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-default">
              <button
                onClick={() => {
                  setIsEditing(false);
                  fetchData();
                }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Kembali ke Daftar Catatan</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveNote}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 rounded-md shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  <span>Simpan Catatan</span>
                </button>
              </div>
            </div>

            {/* Note Meta Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 rounded-lg bg-surface-1 border border-border-default text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-medium text-foreground block">
                  Judul Catatan *
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Asas Legalitas dan Teori Kesalahan"
                  className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground block">
                  Mata Kuliah
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">-- Tanpa Mata Kuliah --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live Markdown Editor (Max 65-75ch measure) */}
            <MarkdownEditor
              content={content}
              onChange={setContent}
              onAiSummarize={handleAiSummarize}
              isSummarizing={isSummarizing}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search & Course Filter */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  placeholder="Cari catatan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-1 border border-border-default rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="ALL">Semua Mata Kuliah</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes Grid */}
            {filteredNotes.length === 0 && !isLoading ? (
              <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-6 space-y-2">
                <p className="text-foreground font-medium">Belum ada catatan kuliah.</p>
                <p className="text-muted-foreground">
                  Mulai tulis catatan kuliah Anda sekarang untuk mendokumentasikan materi.
                </p>
                <button
                  onClick={handleOpenNewNote}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 rounded-md shadow-xs transition-colors mt-2"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tulis Catatan Pertama</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={handleSelectNote}
                    onDelete={handleDeleteNote}
                    onTogglePin={async (noteId, curr) => {
                      await fetch(`/api/notes/${noteId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ pinned: curr === 0 }),
                      });
                      fetchData();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Summary Modal */}
        <Dialog open={summaryModalOpen} onOpenChange={setSummaryModalOpen}>
          <DialogContent maxWidth="max-w-xl">
            <DialogHeader>
              <DialogTitle>Ringkasan Materi & Latihan Soal</DialogTitle>
              <DialogDescription>
                Intisari materi dan latihan evaluasi mandiri dari catatan Anda.
              </DialogDescription>
            </DialogHeader>

            {aiSummary && (
              <div className="space-y-3 my-1 text-xs max-h-[70vh] overflow-y-auto pr-1">
                <div className="p-3 rounded-md bg-surface-2 border border-border-default space-y-1">
                  <h4 className="font-semibold text-foreground">Ringkasan:</h4>
                  <p className="text-muted-foreground leading-relaxed">
                    {aiSummary.summary}
                  </p>
                </div>

                {aiSummary.keyConcepts?.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                      Konsep Kunci:
                    </h4>
                    <div className="space-y-1">
                      {aiSummary.keyConcepts.map((k: any, idx: number) => (
                        <div key={idx} className="p-2 rounded-md bg-surface-1 border border-border-default text-xs">
                          <strong className="text-foreground">{k.concept}:</strong>{" "}
                          <span className="text-muted-foreground">{k.definition}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiSummary.practiceQuestions?.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                      Latihan Soal:
                    </h4>
                    <div className="space-y-1.5">
                      {aiSummary.practiceQuestions.map((q: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-md bg-surface-1 border border-border-default space-y-1"
                        >
                          <p className="font-medium text-foreground">
                            {idx + 1}. {q.question}
                          </p>
                          <details className="text-xs text-muted-foreground cursor-pointer pt-0.5">
                            <summary className="font-medium text-primary hover:underline">
                              Lihat Kunci Jawaban
                            </summary>
                            <p className="mt-1 p-2 rounded bg-surface-2 border border-border-default text-foreground">
                              {q.answer}
                            </p>
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </PageContainer>
    </AppShell>
  );
}
