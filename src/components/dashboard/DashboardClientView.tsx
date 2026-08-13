"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Clock,
  MapPin,
  Circle,
  CheckCircle2,
  Calendar,
  ExternalLink,
  Plus,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import { formatDateIndonesian } from "@/lib/utils";
import { invalidateClientCache } from "@/lib/client-cache";

interface DashboardClientViewProps {
  initialData: {
    todaySchedules: any[];
    nextClass: any;
    urgentTasks: any[];
    upcomingExams: any[];
    progress: {
      completed: number;
      total: number;
      percent: number;
    };
    userDisplayName: string;
    greeting: string;
    dateString: string;
  };
}

export function DashboardClientView({ initialData }: DashboardClientViewProps) {
  const {
    todaySchedules,
    nextClass,
    urgentTasks,
    upcomingExams,
    progress,
    greeting,
    dateString,
  } = initialData;
  const [tasks, setTasks] = useState(urgentTasks);

  const handleToggleTask = async (taskId: string) => {
    // Optimistic UI state transition
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      invalidateClientCache();
    } catch (err) {
      console.error("Failed to complete task:", err);
    }
  };

  return (
    <div className="space-y-7 animate-entrance">
      {/* 1. Paper & Ink Editorial Hero Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border-default">
        <div className="space-y-1">
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">
            {dateString}
          </p>
          <h1 className="font-editorial italic text-2xl sm:text-4xl text-foreground font-normal tracking-tight">
            {greeting}
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <span className="text-xs text-muted-foreground block font-mono">
              Progres Semester
            </span>
            <span className="text-xs font-semibold text-foreground font-mono">
              {progress.completed}/{progress.total} Tugas ({progress.percent}%)
            </span>
          </div>
          <Link
            href="/tugas"
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-2 rounded-md shadow-xs transition-all select-none"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Tambah Tugas</span>
          </Link>
        </div>
      </div>

      {/* 2. Next Class Highlight Banner (Editorial Left Accent Line) */}
      {nextClass && (
        <div className="p-4 sm:p-5 rounded-lg bg-surface-1 border border-border-default border-l-4 border-l-primary flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground uppercase tracking-wide">
              <span className="font-semibold text-primary">KULIAH BERIKUTNYA</span>
              <span>·</span>
              <span className="text-foreground font-medium">{nextClass.timeRemaining}</span>
            </div>
            <div className="font-semibold text-foreground text-base sm:text-lg truncate">
              {nextClass.courseName}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono text-foreground font-medium">
                {nextClass.startTime} – {nextClass.endTime}
              </span>
              {nextClass.room && <span>· Ruang {nextClass.room}</span>}
              {nextClass.lecturer && <span>· {nextClass.lecturer}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {nextClass.onlineUrl && (
              <a
                href={nextClass.onlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-secondary text-foreground hover:bg-surface-3 px-3 py-1.5 rounded-md border border-border-default transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-primary" />
                <span>Kuliah Online</span>
              </a>
            )}
            <Link
              href={`/mata-kuliah/${nextClass.courseId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 transition-colors"
            >
              <span>Course Hub</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* 3. Main Two-Column Asymmetric Grid (7/5 split) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* Left Column (7 cols): Tenggat Waktu & Prioritas */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Tasks / Deadlines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Tenggat Waktu & Prioritas ({tasks.length})
              </h2>
              <Link
                href="/tugas"
                className="text-xs font-medium text-primary hover:underline transition-colors"
              >
                Kelola Semua Tugas →
              </Link>
            </div>

            <div className="border border-border-default rounded-lg overflow-hidden bg-surface-1 divide-y divide-border-subtle shadow-xs">
              {tasks.length === 0 ? (
                <div className="p-8 text-center space-y-1">
                  <p className="font-editorial italic text-base text-foreground">
                    Semua tugas telah selesai diselesaikan.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nikmati waktu luang Anda atau persiapkan materi kuliah mendatang.
                  </p>
                </div>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 sm:px-4 flex items-start gap-3 hover:bg-surface-2 transition-colors group text-xs"
                  >
                    <button
                      onClick={() => handleToggleTask(task.id)}
                      className="mt-0.5 text-muted-foreground hover:text-status-success transition-colors shrink-0"
                      title="Tandai selesai"
                    >
                      <Circle className="h-4 w-4" />
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link
                          href="/tugas"
                          className="font-medium text-foreground hover:text-primary transition-colors truncate text-sm"
                        >
                          {task.title}
                        </Link>
                        {task.dueAt && (
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            {formatDateIndonesian(task.dueAt, true)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span className="text-foreground/80 font-sans">{task.courseName}</span>
                        {task.priority === "urgent" && (
                          <>
                            <span>·</span>
                            <span className="text-status-danger font-semibold">Mendesak</span>
                          </>
                        )}
                        {task.priority === "high" && (
                          <>
                            <span>·</span>
                            <span className="text-status-warning font-semibold">Tinggi</span>
                          </>
                        )}
                        {task.subtasksCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{task.completedSubtasksCount}/{task.subtasksCount} Subtugas</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Semester Exams */}
          {upcomingExams.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  Agenda Evaluasi & Ujian
                </h2>
                <Link
                  href="/ujian"
                  className="text-xs font-medium text-primary hover:underline transition-colors"
                >
                  Lihat Semua Ujian →
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {upcomingExams.map((e) => (
                  <Link
                    key={e.id}
                    href="/ujian"
                    className="p-3.5 rounded-lg border border-border-default bg-surface-1 hover:bg-surface-2 flex items-center justify-between transition-colors shadow-xs group"
                  >
                    <div className="min-w-0 flex-1 pr-2 space-y-0.5">
                      <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {e.name}
                      </p>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {e.courseName} · {formatDateIndonesian(e.examAt, false)}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-primary px-2 py-0.5 rounded bg-accent-subtle shrink-0">
                      {e.daysRemaining} hari lagi
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Jadwal Hari Ini & Semester Progress */}
        <div className="lg:col-span-5 space-y-6">
          {/* Today Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Jadwal Hari Ini ({todaySchedules.length})
              </h2>
              <Link href="/kalender" className="text-xs font-medium text-primary hover:underline transition-colors">
                Lihat Kalender →
              </Link>
            </div>

            <div className="border border-border-default rounded-lg overflow-hidden bg-surface-1 divide-y divide-border-subtle shadow-xs">
              {todaySchedules.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground font-editorial italic">
                  Tidak ada agenda perkuliahan hari ini.
                </div>
              ) : (
                todaySchedules.map((s: any) => (
                  <Link
                    key={s.id}
                    href={`/mata-kuliah/${s.courseId}`}
                    className="p-3.5 flex items-center justify-between hover:bg-surface-2 transition-colors block text-xs group"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                      <div className="font-medium text-foreground truncate group-hover:text-primary transition-colors text-sm">
                        {s.courseName}
                      </div>
                      <div className="text-muted-foreground text-[11px] font-mono">
                        {s.startTime} – {s.endTime} {s.room ? `· Ruang ${s.room}` : ""}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0 bg-surface-2 px-2 py-0.5 rounded border border-border-subtle">
                      {s.credits || 2} SKS
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Progress Summary Card */}
          <div className="p-5 rounded-lg border border-border-default bg-surface-1 space-y-3 text-xs shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Kemajuan Semester
              </span>
              <span className="font-mono text-foreground font-bold">{progress.percent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {progress.completed} dari {progress.total} tugas akademik semester ini telah diselesaikan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
