"use client";

import React from "react";
import { Pin, Trash2, Calendar } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { formatDateIndonesian } from "@/lib/utils";

export function NoteCard({
  note,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  note: any;
  onEdit: (note: any) => void;
  onDelete: (noteId: string) => void;
  onTogglePin?: (noteId: string, currentPin: number) => void;
}) {
  const isPinned = note.pinned === 1;

  return (
    <Card
      onClick={() => onEdit(note)}
      className={`border-border-default hover:bg-surface-2 transition-colors cursor-pointer group relative ${
        isPinned ? "border-accent/40 bg-surface-1" : ""
      }`}
    >
      <CardContent className="p-3.5 space-y-2 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 flex-1 min-w-0">
            {note.course && (
              <span className="px-1.5 py-0.2 rounded bg-secondary text-muted-foreground font-mono text-[10px]">
                {note.course.name}
              </span>
            )}
            <h3 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {note.title}
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {onTogglePin && (
              <button
                onClick={() => onTogglePin(note.id, note.pinned)}
                className={`p-1 rounded transition-colors ${
                  isPinned ? "text-primary bg-accent-subtle" : "text-muted-foreground hover:bg-secondary"
                }`}
                title={isPinned ? "Lepas Sematan" : "Sematkan Catatan"}
              >
                <Pin className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(note.id)}
              className="p-1 rounded text-muted-foreground hover:text-status-danger hover:bg-status-danger-subtle transition-colors"
              title="Hapus Catatan"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {note.content || "Catatan kosong."}
        </p>

        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1.5 border-t border-border-subtle">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDateIndonesian(note.updatedAt, false)}
          </span>
          <span>Markdown</span>
        </div>
      </CardContent>
    </Card>
  );
}
