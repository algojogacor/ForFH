"use client";

import React from "react";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";

export function TodaySchedule({ schedules }: { schedules: any[] }) {
  return (
    <Card className="h-full border-border/80 card-elevated">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
        <CardTitle className="flex items-center gap-2.5 text-base sm:text-lg">
          <CalendarDays className="h-4 w-4 text-amber-400" />
          Jadwal Kuliah Hari Ini
        </CardTitle>
        <Link
          href="/jadwal"
          className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          Lihat Semua
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {schedules.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-xs sm:text-sm">
            Tidak ada agenda perkuliahan aktif hari ini.
          </div>
        ) : (
          schedules.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3.5 rounded-xl bg-muted/25 border border-border/60 hover:bg-muted/50 transition-colors group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground group-hover:text-amber-300 transition-colors">
                    {s.courseName}
                  </span>
                  {s.courseCode && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      ({s.courseCode})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium text-amber-400/80">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    {s.startTime} - {s.endTime}
                  </span>
                  {s.room && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      Ruang {s.room}
                    </span>
                  )}
                </div>
              </div>
              <Link
                href={`/mata-kuliah/${s.courseId}`}
                className="p-2 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-card border border-transparent hover:border-border/60 transition-all"
                title="Buka Course Hub"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
