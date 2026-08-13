"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  CheckSquare,
  GraduationCap,
  FileText,
  Scale,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { Dialog, DialogContent } from "../ui/Dialog";
import { cachedFetch } from "@/lib/client-cache";

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tasksList, setTasksList] = useState<any[]>([]);
  const [coursesList, setCoursesList] = useState<any[]>([]);
  const [notesList, setNotesList] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      // Pre-fetch tasks, courses, notes
      Promise.all([
        cachedFetch("/api/tasks").catch(() => ({ tasks: [] })),
        cachedFetch("/api/courses").catch(() => ({ courses: [] })),
        cachedFetch("/api/notes").catch(() => ({ notes: [] })),
      ]).then(([tasksData, coursesData, notesData]) => {
        setTasksList(tasksData.tasks || []);
        setCoursesList(coursesData.courses || []);
        setNotesList(notesData.notes || []);
      });
    }
  }, [open]);

  const q = query.toLowerCase();
  const filteredTasks = tasksList.filter((t) => t.title?.toLowerCase().includes(q)).slice(0, 4);
  const filteredCourses = coursesList.filter((c) => c.name?.toLowerCase().includes(q)).slice(0, 4);
  const filteredNotes = notesList.filter((n) => n.title?.toLowerCase().includes(q)).slice(0, 4);

  const navigateTo = (url: string) => {
    onOpenChange(false);
    router.push(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-xl" className="p-0 overflow-hidden border-border-default bg-surface-1">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default bg-surface-1">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Ketik perintah atau cari modul, mata kuliah, tugas..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-3 text-xs">
          {/* Quick Navigation Links */}
          <div className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Navigasi Cepat
            </div>
            <button
              onClick={() => navigateTo("/tugas")}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">Daftar Tugas & Deadline</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigateTo("/mata-kuliah")}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">Mata Kuliah & Jadwal</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigateTo("/hukum")}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">Pusat Riset Hukum (Pasal.id)</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigateTo("/kalender")}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">Kalender Akademik</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>

          {/* Matched Courses */}
          {filteredCourses.length > 0 && (
            <div className="space-y-0.5 pt-1 border-t border-border-subtle">
              <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Mata Kuliah
              </div>
              {filteredCourses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigateTo(`/mata-kuliah/${c.id}`)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground">{c.name}</span>
                    {c.code && (
                      <span className="text-[11px] font-mono text-muted-foreground">({c.code})</span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground">{c.credits || 2} SKS</span>
                </button>
              ))}
            </div>
          )}

          {/* Matched Tasks */}
          {filteredTasks.length > 0 && (
            <div className="space-y-0.5 pt-1 border-t border-border-subtle">
              <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Tugas
              </div>
              {filteredTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigateTo("/tugas")}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground truncate">{t.title}</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground uppercase">{t.status}</span>
                </button>
              ))}
            </div>
          )}

          {/* Matched Notes */}
          {filteredNotes.length > 0 && (
            <div className="space-y-0.5 pt-1 border-t border-border-subtle">
              <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Catatan
              </div>
              {filteredNotes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => navigateTo("/catatan")}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground truncate">{n.title}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
