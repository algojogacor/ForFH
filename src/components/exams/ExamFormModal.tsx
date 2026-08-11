"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { EXAM_TYPES } from "@/lib/constants";

export function ExamFormModal({
  open,
  onOpenChange,
  courses = [],
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses?: any[];
  onSaved: () => void;
}) {
  const { toast, success } = useToast();
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [type, setType] = useState("UTS");
  const [examDate, setExamDate] = useState("");
  const [examTime, setExamTime] = useState("08:00");
  const [location, setLocation] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !courseId || !examDate) {
      toast("Nama ujian, mata kuliah, dan tanggal ujian wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const examAtIso = `${examDate}T${examTime || "08:00"}:00`;
      const initialTopics = topicsText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);

      await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          courseId,
          type,
          examAt: examAtIso,
          location: location.trim() || null,
          initialTopics,
        }),
      });

      success("Jadwal ujian berhasil ditambahkan.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast("Gagal menyimpan jadwal ujian.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Jadwal Ujian</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs my-1">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Nama Ujian *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. UTS Hukum Pidana"
              required
              className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Mata Kuliah *
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="">-- Pilih Mata Kuliah --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Tipe Ujian
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Tanggal Ujian *
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                required
                className="w-full bg-surface-1 border border-border-default rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Jam Ujian
              </label>
              <input
                type="time"
                value={examTime}
                onChange={(e) => setExamTime(e.target.value)}
                className="w-full bg-surface-1 border border-border-default rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Ruang / Lokasi Ujian
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Ruang Sidang Utama"
              className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Daftar Topik Materi (1 baris per topik)
            </label>
            <textarea
              value={topicsText}
              onChange={(e) => setTopicsText(e.target.value)}
              placeholder="Asas Legalitas&#10;Teori Kausalitas&#10;Percobaan dan Penyertaan"
              rows={3}
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
              Simpan Ujian
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
