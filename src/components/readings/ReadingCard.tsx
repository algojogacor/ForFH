"use client";

import React from "react";
import { Trash2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { Progress } from "../ui/Progress";

export function ReadingCard({
  reading,
  onUpdateProgress,
  onDelete,
}: {
  reading: any;
  onUpdateProgress: (readingId: string, newPage: number) => void;
  onDelete: (readingId: string) => void;
}) {
  const current = reading.currentPage || 0;
  const start = reading.startPage || 1;
  const end = reading.endPage || current || 100;
  const totalPages = Math.max(1, end - start);
  const readPages = Math.max(0, current - start);
  const percentage = Math.min(100, Math.round((readPages / totalPages) * 100));

  const isDone = reading.status === "DONE" || current >= end;

  return (
    <Card className={`border-border-default transition-colors ${isDone ? "opacity-70 bg-surface-1" : ""}`}>
      <CardContent className="p-3.5 space-y-2.5 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-1.5 py-0.2 rounded bg-secondary text-muted-foreground font-mono text-[10px]">
                {reading.type || "Buku"}
              </span>
              {reading.course && (
                <span className="text-[11px] font-mono text-foreground font-medium">
                  {reading.course.name}
                </span>
              )}
            </div>
            <h4 className="font-semibold text-sm text-foreground leading-snug truncate">
              {reading.title}
            </h4>
            {reading.author && (
              <p className="text-muted-foreground text-[11px]">Penulis: {reading.author}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {reading.url && (
              <a
                href={reading.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Buka Link Dokumen"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              onClick={() => onDelete(reading.id)}
              className="p-1 rounded text-muted-foreground hover:text-status-danger hover:bg-status-danger-subtle transition-colors"
              title="Hapus Bacaan"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-muted-foreground">
              Hal {current} / {end}
            </span>
            <span className="font-semibold text-foreground">{percentage}%</span>
          </div>
          <Progress value={percentage} />
        </div>

        {/* Page Adjuster Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px]">
          <span className="text-muted-foreground font-mono">Update:</span>
          <div className="flex items-center gap-1 font-mono">
            <button
              onClick={() => onUpdateProgress(reading.id, Math.max(start, current - 5))}
              className="px-2 py-0.5 rounded border border-border-default hover:bg-surface-2 text-foreground transition-colors"
            >
              -5
            </button>
            <button
              onClick={() => onUpdateProgress(reading.id, Math.min(end, current + 5))}
              className="px-2 py-0.5 rounded border border-border-default hover:bg-surface-2 text-foreground transition-colors"
            >
              +5
            </button>
            <button
              onClick={() => onUpdateProgress(reading.id, Math.min(end, current + 20))}
              className="px-2 py-0.5 rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-colors"
            >
              +20
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
