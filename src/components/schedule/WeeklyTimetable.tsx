"use client";

import React from "react";
import { Clock, MapPin } from "lucide-react";
import { INDONESIAN_DAYS } from "@/lib/utils";

export function WeeklyTimetable({
  schedules = [],
  onEditSchedule,
}: {
  schedules: any[];
  onEditSchedule?: (schedule: any) => void;
}) {
  // Days from Monday (1) to Saturday (6)
  const displayDays = [1, 2, 3, 4, 5, 6];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {displayDays.map((dayIdx) => {
        const daySchedules = schedules
          .filter((s) => s.dayOfWeek === dayIdx && s.enabled === 1)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        const dayName = INDONESIAN_DAYS[dayIdx];
        const isToday = new Date().getDay() === dayIdx;

        return (
          <div
            key={dayIdx}
            className={`flex flex-col rounded-lg border p-3 space-y-2.5 min-h-[200px] transition-colors ${
              isToday
                ? "border-primary/40 bg-surface-1"
                : "border-border-default bg-surface-1"
            }`}
          >
            {/* Day Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-border-default">
              <span
                className={`text-xs font-semibold uppercase tracking-wider font-mono ${
                  isToday ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {dayName}
              </span>
              {isToday && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </div>

            {/* Class Cards for this day */}
            <div className="space-y-1.5 flex-1">
              {daySchedules.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-xs text-muted-foreground/50 py-6">
                  Tidak ada kelas
                </div>
              ) : (
                daySchedules.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => onEditSchedule?.(s)}
                    className="p-2.5 rounded-md border border-border-default bg-surface-2 hover:bg-surface-3 cursor-pointer transition-colors space-y-1 group"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {s.courseName}
                      </p>
                      {s.credits && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-surface-1 text-muted-foreground font-mono shrink-0">
                          {s.credits} SKS
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 text-[11px] text-muted-foreground font-mono">
                      <div className="flex items-center gap-1 text-foreground">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>
                          {s.startTime} – {s.endTime}
                        </span>
                      </div>
                      {s.room && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span>Ruang {s.room}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
