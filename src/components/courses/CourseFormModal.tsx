"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { invalidateClientCache } from "@/lib/client-cache";

export function CourseFormModal({
  open,
  onOpenChange,
  courseToEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseToEdit?: any;
  onSaved: () => void;
}) {
  const { toast, success } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [lecturer, setLecturer] = useState("");
  const [credits, setCredits] = useState<number | "">(3);
  const [defaultRoom, setDefaultRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (courseToEdit) {
      setName(courseToEdit.name || "");
      setCode(courseToEdit.code || "");
      setLecturer(courseToEdit.lecturer || "");
      setCredits(courseToEdit.credits || 3);
      setDefaultRoom(courseToEdit.defaultRoom || "");
      setNotes(courseToEdit.notes || "");
    } else {
      setName("");
      setCode("");
      setLecturer("");
      setCredits(3);
      setDefaultRoom("");
      setNotes("");
    }
  }, [courseToEdit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast("Nama mata kuliah wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        lecturer: lecturer.trim() || null,
        credits: credits ? Number(credits) : 3,
        defaultRoom: defaultRoom.trim() || null,
        notes: notes.trim() || null,
      };

      if (courseToEdit) {
        await fetch(`/api/courses/${courseToEdit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        success("Mata kuliah berhasil diperbarui.");
      } else {
        await fetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        success("Mata kuliah berhasil ditambahkan.");
      }

      invalidateClientCache();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast("Gagal menyimpan mata kuliah.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {courseToEdit ? "Edit Mata Kuliah" : "Tambah Mata Kuliah"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 my-1 text-xs">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Nama Mata Kuliah *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hukum Pidana"
              required
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Kode Mata Kuliah
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. HKP201"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Bobot SKS
              </label>
              <select
                value={credits}
                onChange={(e) => setCredits(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {[1, 2, 3, 4, 6].map((n) => (
                  <option key={n} value={n} className="bg-card text-foreground">
                    {n} SKS
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Dosen Pengampu
              </label>
              <input
                type="text"
                value={lecturer}
                onChange={(e) => setLecturer(e.target.value)}
                placeholder="Nama dosen"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Ruang Kuliah
              </label>
              <input
                type="text"
                value={defaultRoom}
                onChange={(e) => setDefaultRoom(e.target.value)}
                placeholder="e.g. R.304"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Catatan
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan..."
              rows={2}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
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
              className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shadow-xs transition-colors"
            >
              {courseToEdit ? "Simpan Perubahan" : "Simpan"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
