"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { INDONESIAN_DAYS } from "@/lib/utils";
import { invalidateClientCache } from "@/lib/client-cache";

export function ScheduleFormModal({
  open,
  onOpenChange,
  scheduleToEdit,
  courses = [],
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleToEdit?: any;
  courses?: any[];
  onSaved: () => void;
}) {
  const { toast, success } = useToast();
  const [courseId, setCourseId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:40");
  const [room, setRoom] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (scheduleToEdit) {
      setCourseId(scheduleToEdit.courseId || "");
      setDayOfWeek(scheduleToEdit.dayOfWeek !== undefined ? scheduleToEdit.dayOfWeek : 1);
      setStartTime(scheduleToEdit.startTime || "08:00");
      setEndTime(scheduleToEdit.endTime || "09:40");
      setRoom(scheduleToEdit.room || "");
      setOnlineUrl(scheduleToEdit.onlineUrl || "");
    } else {
      setCourseId(courses[0]?.id || "");
      setDayOfWeek(1);
      setStartTime("08:00");
      setEndTime("09:40");
      setRoom("");
      setOnlineUrl("");
    }
  }, [scheduleToEdit, courses, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) {
      toast("Pilih mata kuliah terlebih dahulu.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        courseId,
        dayOfWeek: Number(dayOfWeek),
        startTime,
        endTime,
        room: room.trim() || null,
        onlineUrl: onlineUrl.trim() || null,
      };

      if (scheduleToEdit) {
        await fetch(`/api/schedules/${scheduleToEdit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        success("Jadwal kuliah berhasil diperbarui.");
      } else {
        await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        success("Jadwal kuliah berhasil ditambahkan.");
      }

      invalidateClientCache();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast("Gagal menyimpan jadwal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {scheduleToEdit ? "Edit Jadwal Kuliah" : "Tambah Jadwal Kuliah"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs my-1">
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
                  {c.name} {c.code ? `(${c.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Hari Kuliah *
            </label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              required
            >
              {INDONESIAN_DAYS.map((dayName, idx) => (
                <option key={idx} value={idx}>
                  {dayName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Jam Mulai *
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-surface-1 border border-border-default rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Jam Selesai *
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-surface-1 border border-border-default rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Ruang Kuliah
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. R.304"
              className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Link Kelas Online (Opsional)
            </label>
            <input
              type="url"
              value={onlineUrl}
              onChange={(e) => setOnlineUrl(e.target.value)}
              placeholder="https://meet.google.com/..."
              className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
              {scheduleToEdit ? "Simpan Perubahan" : "Simpan Jadwal"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
