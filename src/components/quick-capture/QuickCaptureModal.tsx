"use client";

import React, { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/Dialog";
import { VoiceCaptureButton } from "./VoiceCaptureButton";
import { useToast } from "../ui/Toast";
import { TASK_TYPES, TASK_PRIORITIES } from "@/lib/constants";

export function QuickCaptureModal({
  open,
  onOpenChange,
  onTaskCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated?: () => void;
}) {
  const { toast, success } = useToast();
  const [inputText, setInputText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);

  // Parsed / Editable form state
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [type, setType] = useState("assignment");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [hasParsed, setHasParsed] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/courses")
        .then((r) => r.json())
        .then((data) => setCourses(data.courses || []))
        .catch(() => {});
    } else {
      setInputText("");
      setTitle("");
      setCourseId("");
      setType("assignment");
      setDueDate("");
      setDueTime("");
      setPriority("medium");
      setEstimatedMinutes("");
      setNotes("");
      setHasParsed(false);
    }
  }, [open]);

  const handleParseWithAI = async () => {
    if (!inputText.trim()) {
      toast("Masukkan kalimat tugas terlebih dahulu.");
      return;
    }

    setIsParsing(true);
    try {
      const res = await fetch("/api/ai/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: inputText }),
      });

      const data = await res.json();
      if (data.parsed) {
        setTitle(data.parsed.title || inputText);
        setCourseId(data.parsed.courseId || "");
        setType(data.parsed.type || "assignment");
        setDueDate(data.parsed.dueDate || "");
        setDueTime(data.parsed.dueTime || "23:59");
        setPriority(data.parsed.priority || "medium");
        setEstimatedMinutes(data.parsed.estimatedMinutes || "");
        setNotes(data.parsed.notes || "");
        setHasParsed(true);
      }
    } catch (err) {
      setTitle(inputText);
      setHasParsed(true);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || inputText.trim();
    if (!finalTitle) {
      toast("Judul tugas wajib diisi.");
      return;
    }

    setIsSaving(true);
    try {
      let dueAtIso: string | null = null;
      if (dueDate) {
        dueAtIso = `${dueDate}T${dueTime || "23:59"}:00`;
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          courseId: courseId || null,
          type,
          dueAt: dueAtIso,
          priority,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
          description: notes.trim() || null,
          source: hasParsed ? "ai" : "quick_capture",
        }),
      });

      if (!res.ok) {
        throw new Error("Gagal menyimpan tugas.");
      }

      success("Tugas berhasil ditambahkan.");
      onOpenChange(false);
      onTaskCreated?.();
    } catch (err: any) {
      toast(err.message || "Gagal menyimpan tugas.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick Capture</DialogTitle>
          <DialogDescription>
            Tulis cepat tugas atau catatan akademik. Tekan Enter untuk menyimpan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs my-1">
          {/* Primary Quick Input Field */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Apa yang perlu kamu catat? (e.g. Makalah Hukum Pidana Senin jam 9 malam)"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (!hasParsed) setTitle(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !hasParsed) {
                    e.preventDefault();
                    handleParseWithAI();
                  }
                }}
                className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
            <VoiceCaptureButton
              onTranscript={(text) => {
                setInputText(text);
                setTitle(text);
              }}
            />
            <button
              type="button"
              onClick={handleParseWithAI}
              disabled={isParsing || !inputText.trim()}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-secondary text-foreground hover:bg-surface-3 border border-border-default text-xs font-medium transition-colors shrink-0 disabled:opacity-50"
            >
              {isParsing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Bantu Ekstrak</span>
            </button>
          </div>

          {/* Form Details */}
          <form onSubmit={handleSave} className="space-y-3 pt-2 border-t border-border-default">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Judul Tugas *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Judul tugas"
                required
                className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Mata Kuliah
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">-- Pilih Mata Kuliah --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Jenis Tugas
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
                >
                  {TASK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Tanggal Deadline
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-surface-1 border border-border-default rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Jam Deadline
                </label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full bg-surface-1 border border-border-default rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Prioritas
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving || (!title.trim() && !inputText.trim())}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 rounded-md shadow-xs transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>Simpan Tugas</span>
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
