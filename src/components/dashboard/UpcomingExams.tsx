"use client";

import React from "react";
import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { formatRelativeTimeIndonesian, formatDateIndonesian } from "@/lib/utils";

export function UpcomingExams({ exams }: { exams: any[] }) {
  return (
    <Card className="border-border/80 card-elevated">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-400" />
          Agenda Evaluasi & Ujian
        </CardTitle>
        <Link
          href="/ujian"
          className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          Semua Ujian
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {exams.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground text-xs">
            Belum ada jadwal ujian semester terdaftar.
          </div>
        ) : (
          exams.slice(0, 3).map((e) => {
            const rel = formatRelativeTimeIndonesian(e.examAt);
            return (
              <div
                key={e.id}
                className="flex items-center justify-between p-3 rounded-xl bg-muted/25 border border-border/60"
              >
                <div>
                  <p className="text-xs font-bold text-foreground">{e.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {e.course?.name || "Mata Kuliah"} • {formatDateIndonesian(e.examAt, false)}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-lg">
                  {rel.text}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
