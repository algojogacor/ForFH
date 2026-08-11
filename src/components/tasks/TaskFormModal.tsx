"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { TASK_TYPES, TASK_PRIORITIES } from "@/lib/constants";

export function TaskFormModal({
  open,
  onOpenChange,
  taskToEdit,
  courses = [],
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskToEdit?: any;
  courses?: any[];
  onSaved: () => void;
}) {
  const { toast, success } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [type, setType] = useState("assignment");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.title || "");
      setDescription(taskToEdit.description || "");
      setCourseId(taskToEdit.courseId || "");
      setType(taskToEdit.type || "assignment");
      if (taskToEdit.dueAt) {
        const d = new Date(taskToEdit.dueAt);
        setDueDate(d.toISOString().slice(0, 10));
        setDueTime(d.toTimeString().slice(0, 5));
      } else {
        setDueDate("");
        setDueTime("");
      }
      setPriority(taskToEdit.priority || "medium");
      setEstimatedMinutes(taskToEdit.estimatedMinutes || "");
    } else {
      setTitle("");
      setDescription("");
      setCourseId("");
      setType("assignment");
      setDueDate("");
      setDueTime("23:59");
      setPriority("medium");
      setEstimatedMinutes("");
    }
  }, [taskToEdit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast("Judul tugas wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      let dueAtIso: string | null = null;
      if (dueDate) {
        dueAtIso = `${dueDate}T${dueTime || "23:59"}:00`;
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        courseId: courseId || null,
        type,
        dueAt: dueAtIso,
        priority,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      };

      if (taskToEdit) {
        await fetch(`/api/tasks/${taskToEdit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        success("Tugas berhasil diperbarui.");
      } else {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        success("Tugas baru berhasil ditambahkan.");
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast("Gagal menyimpan tugas.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {taskToEdit ? "Edit Tugas" : "Tambah Tugas Baru"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs my-1">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Judul Tugas *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Makalah Hukum Acara Perdata"
              required
              className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
                <option value="">-- Tanpa Mata Kuliah --</option>
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

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Deskripsi / Petunjuk Pengerjaan
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catatan instruksi dari dosen atau referensi..."
              rows={2}
              className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 rounded-md shadow-xs transition-colors"
            >
              {taskToEdit ? "Simpan Perubahan" : "Simpan Tugas"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
