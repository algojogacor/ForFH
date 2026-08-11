"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { READING_TYPES } from "@/lib/constants";

export function ReadingFormModal({
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
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [type, setType] = useState("book");
  const [courseId, setCourseId] = useState("");
  const [startPage, setStartPage] = useState<number | "">(1);
  const [endPage, setEndPage] = useState<number | "">(100);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast("Judul bahan bacaan wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim() || null,
          type,
          courseId: courseId || null,
          startPage: startPage ? Number(startPage) : 1,
          endPage: endPage ? Number(endPage) : 100,
          currentPage: startPage ? Number(startPage) : 1,
          notes: notes.trim() || null,
        }),
      });

      success("Bahan bacaan berhasil ditambahkan.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast("Gagal menyimpan bahan bacaan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Bahan Bacaan</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs my-1">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Judul Buku / Jurnal / Modul *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Asas-Asas Hukum Pidana Indonesia"
              required
              className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Penulis / Dosen
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Prof. Moeljatno"
              className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Jenis Literatur
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
              >
                {READING_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Mata Kuliah
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">-- Tanpa MK --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Halaman Awal
              </label>
              <input
                type="number"
                min="1"
                value={startPage}
                onChange={(e) => setStartPage(Number(e.target.value))}
                className="w-full bg-surface-1 border border-border-default rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Halaman Akhir
              </label>
              <input
                type="number"
                min="1"
                value={endPage}
                onChange={(e) => setEndPage(Number(e.target.value))}
                className="w-full bg-surface-1 border border-border-default rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
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
              Simpan Bacaan
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
