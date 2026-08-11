"use client";

import React, { useState } from "react";
import { Clock, MapPin, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { formatDateIndonesian, formatRelativeTimeIndonesian } from "@/lib/utils";

export function ExamCard({
  exam,
  onToggleTopic,
  onAddTopic,
  onDeleteExam,
  onOpenStudyRoadmap,
}: {
  exam: any;
  onToggleTopic: (topicId: string, currentCompleted: number) => void;
  onAddTopic: (examId: string, title: string) => void;
  onDeleteExam: (examId: string) => void;
  onOpenStudyRoadmap: (exam: any) => void;
}) {
  const [newTopic, setNewTopic] = useState("");
  const relative = formatRelativeTimeIndonesian(exam.examAt);

  const topics = exam.topics || [];
  const completedTopicsCount = topics.filter((t: any) => t.completed === 1).length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim()) return;
    onAddTopic(exam.id, newTopic.trim());
    setNewTopic("");
  };

  return (
    <Card className="border-border-default transition-colors">
      <CardContent className="p-4 space-y-3 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] font-mono uppercase">
                {exam.type}
              </Badge>
              {exam.course && (
                <span className="text-[11px] font-mono text-muted-foreground font-medium">
                  {exam.course.name}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm text-foreground leading-snug truncate">
              {exam.name}
            </h3>
          </div>

          <button
            onClick={() => onDeleteExam(exam.id)}
            className="p-1 rounded text-muted-foreground hover:text-status-danger hover:bg-status-danger-subtle transition-colors shrink-0"
            title="Hapus Ujian"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Exam Timing & Location */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border-subtle font-mono text-[11px]">
          <span className="flex items-center gap-1 text-foreground font-medium">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {formatDateIndonesian(exam.examAt, true)}
          </span>
          <span className="text-status-warning font-medium">
            {relative.text}
          </span>
          {exam.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {exam.location}
            </span>
          )}
        </div>

        {/* Topic Checklist */}
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
              Materi ({completedTopicsCount}/{topics.length} Dikuasai)
            </span>
            <button
              onClick={() => onOpenStudyRoadmap(exam)}
              className="text-[11px] text-primary hover:underline font-medium"
            >
              Roadmap Belajar →
            </button>
          </div>

          <div className="space-y-1">
            {topics.map((t: any) => (
              <div
                key={t.id}
                onClick={() => onToggleTopic(t.id, t.completed)}
                className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 hover:bg-secondary border border-border-default cursor-pointer transition-colors text-xs"
              >
                {t.completed === 1 ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={`truncate ${
                    t.completed === 1 ? "line-through text-muted-foreground" : "font-medium text-foreground"
                  }`}
                >
                  {t.title}
                </span>
              </div>
            ))}
          </div>

          <form onSubmit={handleAdd} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              placeholder="Tambah topik materi..."
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              className="flex-1 bg-surface-1 border border-border-default rounded-md px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!newTopic.trim()}
              className="px-2.5 py-1 rounded-md bg-secondary text-foreground hover:bg-surface-3 border border-border-default text-xs font-medium shrink-0 disabled:opacity-50 transition-colors"
            >
              Tambah
            </button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
