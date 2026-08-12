"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { Progress } from "../ui/Progress";
import type { CourseRecap } from "@/lib/campus/mappings";

// Rekap presensi otomatis dari Kampus Kita — agregat per MK (TM/hadir/persen),
// hanya baca. Catatan presensi per tanggal tetap manual (AttendanceTable).
export function AttendanceRecap({
  recaps,
  updatedAt,
}: {
  recaps: CourseRecap[];
  updatedAt?: string | null;
}) {
  const hasWarning = recaps.some((r) => r.persen !== null && r.persen < 75);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Rekap dari Kampus Kita
          </span>
        </div>
        {updatedAt && (
          <span className="text-[11px] font-mono text-muted-foreground">
            sinkron {new Date(updatedAt).toLocaleString("id-ID")}
          </span>
        )}
      </div>

      {hasWarning && (
        <div className="flex items-center gap-1.5 text-xs text-status-warning bg-status-warning-subtle p-2 rounded-md border border-status-warning/20 font-medium">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Ada mata kuliah di bawah 75% batas minimal ujian.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {recaps.map((r, i) => {
          const percentage = r.persen;
          const isWarning = percentage !== null && percentage < 75;
          return (
            <Card
              key={`${r.code || r.name}-${i}`}
              className={`border-border-default transition-colors ${
                isWarning ? "border-status-danger/40 bg-status-danger-subtle/20" : ""
              }`}
            >
              <CardContent className="p-3.5 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <h4 className="font-semibold text-sm text-foreground truncate">
                      {r.name || r.code}
                    </h4>
                    {r.code && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {r.code}
                      </span>
                    )}
                  </div>

                  {percentage !== null ? (
                    <span
                      className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border ${
                        isWarning
                          ? "bg-status-danger-subtle text-status-danger border-status-danger/20"
                          : "bg-status-success-subtle text-status-success border-status-success/20"
                      }`}
                    >
                      {percentage}%
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-muted-foreground">—</span>
                  )}
                </div>

                {percentage !== null && <Progress value={percentage} />}

                <div className="grid grid-cols-2 gap-1.5 text-center text-xs font-mono">
                  <div className="p-1.5 rounded bg-surface-2 border border-border-default">
                    <div className="text-sm font-semibold text-foreground">{r.tm ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Total TM</div>
                  </div>
                  <div className="p-1.5 rounded bg-surface-2 border border-border-default">
                    <div className="text-sm font-semibold text-status-success">{r.hadir ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Hadir</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Agregat per mata kuliah — pertemuan per tanggal tetap dicatat manual di bawah.
      </p>
    </div>
  );
}
