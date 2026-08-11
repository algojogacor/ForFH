"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { Progress } from "../ui/Progress";

export function AttendanceTable({
  courseStats = [],
  onQuickLog,
}: {
  courseStats: any[];
  onQuickLog: (courseId: string, status: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {courseStats.map((stat) => {
        const isWarning = stat.isBelowThreshold;
        const percentage = stat.attendancePercentage || 0;

        return (
          <Card
            key={stat.courseId}
            className={`border-border-default transition-colors ${
              isWarning ? "border-status-danger/40 bg-status-danger-subtle/20" : ""
            }`}
          >
            <CardContent className="p-3.5 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <h4 className="font-semibold text-sm text-foreground truncate">
                    {stat.courseName}
                  </h4>
                  {stat.courseCode && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {stat.courseCode}
                    </span>
                  )}
                </div>

                <span
                  className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border ${
                    percentage >= 75
                      ? "bg-status-success-subtle text-status-success border-status-success/20"
                      : "bg-status-danger-subtle text-status-danger border-status-danger/20"
                  }`}
                >
                  {percentage}%
                </span>
              </div>

              {/* Progress visual bar */}
              <div className="space-y-1">
                <Progress value={percentage} />
              </div>

              {isWarning && (
                <div className="flex items-center gap-1.5 text-xs text-status-danger bg-status-danger-subtle p-2 rounded-md border border-status-danger/20 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Kehadiran di bawah 75% batas minimal ujian.</span>
                </div>
              )}

              {/* Counts */}
              <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
                <div className="p-1.5 rounded bg-surface-2 border border-border-default">
                  <div className="text-sm font-semibold text-status-success">{stat.present}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Hadir</div>
                </div>
                <div className="p-1.5 rounded bg-surface-2 border border-border-default">
                  <div className="text-sm font-semibold text-status-info">{stat.permit}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Izin</div>
                </div>
                <div className="p-1.5 rounded bg-surface-2 border border-border-default">
                  <div className="text-sm font-semibold text-status-warning">{stat.sick}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Sakit</div>
                </div>
                <div className="p-1.5 rounded bg-surface-2 border border-border-default">
                  <div className="text-sm font-semibold text-status-danger">{stat.absent}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Alpa</div>
                </div>
              </div>

              {/* Quick Record Attendance Buttons */}
              <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-muted-foreground">Catat Presensi:</span>
                <div className="flex items-center gap-1 font-mono text-xs">
                  <button
                    onClick={() => onQuickLog(stat.courseId, "PRESENT")}
                    className="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-border-default text-status-success font-medium transition-colors"
                    title="Hadir"
                  >
                    H
                  </button>
                  <button
                    onClick={() => onQuickLog(stat.courseId, "PERMIT")}
                    className="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-border-default text-status-info font-medium transition-colors"
                    title="Izin"
                  >
                    I
                  </button>
                  <button
                    onClick={() => onQuickLog(stat.courseId, "SICK")}
                    className="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-border-default text-status-warning font-medium transition-colors"
                    title="Sakit"
                  >
                    S
                  </button>
                  <button
                    onClick={() => onQuickLog(stat.courseId, "ABSENT")}
                    className="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-border-default text-status-danger font-medium transition-colors"
                    title="Alpa"
                  >
                    A
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
