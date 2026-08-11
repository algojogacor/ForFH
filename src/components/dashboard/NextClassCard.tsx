"use client";

import React from "react";
import Link from "next/link";
import { Clock, MapPin, Video, User, ArrowRight } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { formatRelativeTimeIndonesian } from "@/lib/utils";

interface NextClassCardProps {
  nextClass?: {
    id: string;
    courseId: string;
    courseName: string;
    courseCode?: string;
    courseColor?: string;
    startTime: string;
    endTime: string;
    room?: string;
    onlineUrl?: string;
    lecturer?: string;
    occurrenceDate: Date;
  } | null;
}

export function NextClassCard({ nextClass }: NextClassCardProps) {
  if (!nextClass) {
    return (
      <Card className="bg-card/70 border-border/80 card-elevated">
        <CardContent className="p-5 sm:p-6 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-muted/60 border border-border/60 flex items-center justify-center text-muted-foreground">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="label-caps text-muted-foreground">
                Perkuliahan Berikutnya
              </p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                Tidak ada agenda perkuliahan lagi hari ini.
              </p>
            </div>
          </div>
          <Link
            href="/jadwal"
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors"
          >
            Lihat Jadwal
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  const relative = formatRelativeTimeIndonesian(nextClass.occurrenceDate);

  return (
    <Card className="relative overflow-hidden border-border/90 bg-gradient-to-r from-amber-500/10 via-card to-card shadow-lg card-elevated">
      <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-400" />
      <CardContent className="p-5 sm:p-6 pl-6 sm:pl-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="label-caps px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Kuliah Berikutnya • {relative.text}
              </span>
            </div>
            <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              {nextClass.courseName}
              {nextClass.courseCode && (
                <span className="font-sans text-xs font-normal text-muted-foreground">
                  ({nextClass.courseCode})
                </span>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-3 sm:gap-5 mt-2.5 text-xs sm:text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-semibold text-amber-300/90">
                <Clock className="h-4 w-4 text-amber-400" />
                {nextClass.startTime} - {nextClass.endTime} WIB
              </span>
              {nextClass.room && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-amber-500" />
                  Ruang {nextClass.room}
                </span>
              )}
              {nextClass.lecturer && (
                <span className="flex items-center gap-1.5">
                  <User className="h-4 w-4 text-slate-400" />
                  {nextClass.lecturer}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {nextClass.onlineUrl && (
              <a
                href={nextClass.onlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold transition-colors"
              >
                <Video className="h-4 w-4" />
                <span>Link Zoom</span>
              </a>
            )}
            <Link
              href={`/mata-kuliah/${nextClass.courseId}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted/60 hover:bg-muted border border-border/70 text-xs font-semibold text-foreground transition-colors"
            >
              <span>Course Hub</span>
              <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
