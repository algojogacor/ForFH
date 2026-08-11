"use client";

import React from "react";
import Link from "next/link";
import { Clock, MapPin, User, ArrowRight, Edit, Trash2 } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { INDONESIAN_DAYS } from "@/lib/utils";

export function CourseCard({
  course,
  onEdit,
  onDelete,
}: {
  course: any;
  onEdit: (course: any) => void;
  onDelete: (courseId: string) => void;
}) {
  const schedules = course.schedules || [];

  return (
    <Card className="border-border/80 card-elevated hover:border-border transition-all group overflow-hidden">
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: course.color || "#c9a84c" }}
      />
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="label-caps px-2 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/50">
                {course.credits || 2} SKS
              </span>
              {course.code && (
                <span className="text-xs font-mono font-medium text-amber-400/80">
                  {course.code}
                </span>
              )}
            </div>
            <h3 className="font-display text-lg font-bold text-foreground group-hover:text-amber-300 transition-colors">
              {course.name}
            </h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(course)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Edit Mata Kuliah"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDelete(course.id)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Hapus Mata Kuliah"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Lecturer & Default Room */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {course.lecturer && (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{course.lecturer}</span>
            </div>
          )}
          {course.defaultRoom && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>Ruang {course.defaultRoom}</span>
            </div>
          )}
        </div>

        {/* Weekly Schedules */}
        {schedules.length > 0 && (
          <div className="space-y-1 pt-2.5 border-t border-border/40">
            {schedules.map((s: any) => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 text-xs font-medium text-foreground/90"
              >
                <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>
                  {INDONESIAN_DAYS[s.dayOfWeek]}, {s.startTime} - {s.endTime}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Enter Course Hub Link */}
        <div className="pt-2.5 border-t border-border/40">
          <Link
            href={`/mata-kuliah/${course.id}`}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-muted/40 hover:bg-muted/70 font-semibold text-xs text-foreground transition-colors group/link"
          >
            <span>Buka Course Hub</span>
            <ArrowRight className="h-3.5 w-3.5 text-amber-400 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
