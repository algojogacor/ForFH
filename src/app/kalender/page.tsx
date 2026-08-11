"use client";

import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { formatDateIndonesian, INDONESIAN_MONTHS, INDONESIAN_DAYS } from "@/lib/utils";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"week" | "agenda">("week");

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/exams").then((r) => r.json()),
      fetch("/api/schedules").then((r) => r.json()),
    ])
      .then(([tasksData, examsData, schedData]) => {
        setTasks(tasksData.tasks || []);
        setExams(examsData.exams || []);
        setSchedules(schedData.schedules || []);
      })
      .catch(() => {});
  }, []);

  // Compute week days for the current selected date
  const getWeekDates = (date: Date) => {
    const current = new Date(date);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1); // Start Monday
    const monday = new Date(current.setDate(diff));
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      week.push(d);
    }
    return week;
  };

  const weekDates = getWeekDates(currentDate);

  const handlePrevWeek = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 7);
    setCurrentDate(prev);
    setSelectedDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 7);
    setCurrentDate(next);
    setSelectedDate(next);
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getDay();

    const dayTasks = tasks.filter((t) => t.dueAt && t.dueAt.slice(0, 10) === dateStr);
    const dayExams = exams.filter((e) => e.examAt && e.examAt.slice(0, 10) === dateStr);
    const dayClasses = schedules.filter((s) => s.dayOfWeek === dayOfWeek && s.enabled === 1);

    return { dayTasks, dayExams, dayClasses };
  };

  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 to 20:00

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Kalender Akademik"
          description="Alur jadwal kuliah, deadline tugas, dan jadwal ujian terpadu."
          action={
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 items-center rounded-md bg-secondary p-0.5 text-xs text-muted-foreground border border-border-default">
                <button
                  onClick={() => setViewMode("week")}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    viewMode === "week"
                      ? "bg-surface-1 text-foreground font-semibold shadow-xs"
                      : "hover:text-foreground"
                  }`}
                >
                  Minggu
                </button>
                <button
                  onClick={() => setViewMode("agenda")}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    viewMode === "agenda"
                      ? "bg-surface-1 text-foreground font-semibold shadow-xs"
                      : "hover:text-foreground"
                  }`}
                >
                  Agenda
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevWeek}
                  className="h-8 w-8 rounded-md border border-border-default bg-surface-1 hover:bg-surface-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Minggu Sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setCurrentDate(new Date());
                    setSelectedDate(new Date());
                  }}
                  className="h-8 px-2.5 rounded-md border border-border-default bg-surface-1 hover:bg-surface-2 text-xs text-foreground font-medium transition-colors"
                >
                  Hari Ini
                </button>
                <button
                  onClick={handleNextWeek}
                  className="h-8 w-8 rounded-md border border-border-default bg-surface-1 hover:bg-surface-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Minggu Berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          }
        />

        {/* 1. Mobile Date Selector Strip */}
        <div className="flex sm:hidden items-center justify-between gap-1 overflow-x-auto pb-2 border-b border-border-default">
          {weekDates.map((d, i) => {
            const isSelected = d.toDateString() === selectedDate.toDateString();
            const isToday = d.toDateString() === new Date().toDateString();
            const { dayTasks, dayExams, dayClasses } = getEventsForDate(d);
            const totalEvents = dayTasks.length + dayExams.length + dayClasses.length;

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(d)}
                className={`flex-1 min-w-[44px] py-2 px-1 rounded-md text-center text-xs transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : isToday
                    ? "bg-secondary text-foreground font-medium border border-border-default"
                    : "text-muted-foreground hover:bg-surface-2"
                }`}
              >
                <div className="text-[10px] uppercase font-mono">{INDONESIAN_DAYS[d.getDay()].slice(0, 3)}</div>
                <div className="text-sm font-semibold">{d.getDate()}</div>
                {totalEvents > 0 && (
                  <div className="h-1 w-1 rounded-full bg-accent mx-auto mt-1" />
                )}
              </button>
            );
          })}
        </div>

        {/* 2. Desktop Week Grid View */}
        {viewMode === "week" && (
          <div className="hidden sm:block border border-border-default rounded-lg overflow-hidden bg-surface-1">
            {/* Week Header Row */}
            <div className="grid grid-cols-7 border-b border-border-default divide-x divide-border-default bg-surface-2 text-center text-xs">
              {weekDates.map((d, idx) => {
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div key={idx} className="py-2.5 px-2">
                    <div className="text-[11px] font-mono text-muted-foreground uppercase">
                      {INDONESIAN_DAYS[d.getDay()]}
                    </div>
                    <div className={`text-sm font-semibold mt-0.5 ${isToday ? "text-primary" : "text-foreground"}`}>
                      {d.getDate()} {INDONESIAN_MONTHS[d.getMonth()].slice(0, 3)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Week Schedule Columns */}
            <div className="grid grid-cols-7 divide-x divide-border-default min-h-[420px] p-0 text-xs">
              {weekDates.map((date, colIdx) => {
                const { dayTasks, dayExams, dayClasses } = getEventsForDate(date);

                return (
                  <div key={colIdx} className="p-2 space-y-2 bg-surface-1/50">
                    {/* Classes */}
                    {dayClasses.map((c: any) => (
                      <div
                        key={c.id}
                        className="p-2 rounded-md bg-secondary/80 border border-border-default space-y-0.5 hover:bg-secondary transition-colors"
                      >
                        <div className="font-semibold text-foreground truncate">{c.courseName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">
                          {c.startTime}–{c.endTime}
                        </div>
                        {c.room && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            Ruang {c.room}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Tasks */}
                    {dayTasks.map((t: any) => (
                      <div
                        key={t.id}
                        className="p-1.5 rounded-md bg-status-warning-subtle border border-status-warning/20 space-y-0.5"
                      >
                        <div className="font-medium text-foreground truncate text-[11px]">{t.title}</div>
                        <div className="text-[10px] font-mono text-status-warning">
                          Deadline {t.dueAt?.slice(11, 16) || "23:59"}
                        </div>
                      </div>
                    ))}

                    {/* Exams */}
                    {dayExams.map((e: any) => (
                      <div
                        key={e.id}
                        className="p-1.5 rounded-md bg-status-danger-subtle border border-status-danger/20 space-y-0.5"
                      >
                        <div className="font-medium text-status-danger truncate text-[11px]">{e.name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{e.courseName}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Agenda View (Used on Mobile & when selected on Desktop) */}
        {(viewMode === "agenda" || typeof window !== "undefined") && (
          <div className={`${viewMode === "agenda" ? "block" : "sm:hidden"} space-y-3`}>
            <div className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Agenda: {formatDateIndonesian(selectedDate, false)}
            </div>

            {(() => {
              const { dayTasks, dayExams, dayClasses } = getEventsForDate(selectedDate);
              const hasEvents = dayClasses.length > 0 || dayTasks.length > 0 || dayExams.length > 0;

              if (!hasEvents) {
                return (
                  <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg">
                    Tidak ada jadwal kuliah atau deadline pada tanggal ini.
                  </div>
                );
              }

              return (
                <div className="border border-border-default rounded-lg overflow-hidden bg-surface-1 divide-y divide-border-subtle text-xs">
                  {dayClasses.map((c: any) => (
                    <div key={c.id} className="p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-muted-foreground font-mono text-[11px]">
                        <span>KULIAH · {c.startTime} – {c.endTime}</span>
                        {c.room && <span>Ruang {c.room}</span>}
                      </div>
                      <div className="font-semibold text-foreground text-sm">{c.courseName}</div>
                      {c.lecturer && <div className="text-muted-foreground text-[11px]">Dosen: {c.lecturer}</div>}
                    </div>
                  ))}

                  {dayTasks.map((t: any) => (
                    <div key={t.id} className="p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-status-warning font-mono text-[11px]">
                        <span>TUGAS · {t.type || "assignment"}</span>
                        <span>Deadline {t.dueAt?.slice(11, 16) || "23:59"}</span>
                      </div>
                      <div className="font-semibold text-foreground text-sm">{t.title}</div>
                      <div className="text-muted-foreground text-[11px]">{t.course?.name || "Umum"}</div>
                    </div>
                  ))}

                  {dayExams.map((e: any) => (
                    <div key={e.id} className="p-3.5 space-y-1">
                      <div className="text-status-danger font-mono text-[11px]">UJIAN SEMESTER</div>
                      <div className="font-semibold text-foreground text-sm">{e.name}</div>
                      <div className="text-muted-foreground text-[11px]">{e.courseName}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
