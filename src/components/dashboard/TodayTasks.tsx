"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { formatRelativeTimeIndonesian } from "@/lib/utils";
import confetti from "canvas-confetti";

export function TodayTasks({
  tasks: initialTasks = [],
  onToggleTask,
}: {
  tasks: any[];
  onToggleTask?: (taskId: string, currentStatus: string) => void;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>(initialTasks);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const handleToggle = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "DONE" ? "NOT_STARTED" : "DONE";

    if (nextStatus === "DONE") {
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.8 },
      });
    }

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t))
    );

    if (onToggleTask) {
      onToggleTask(taskId, currentStatus);
    } else {
      try {
        await fetch(`/api/tasks/${taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        router.refresh();
      } catch (err) {
        console.error("Failed to toggle task:", err);
      }
    }
  };

  return (
    <Card className="h-full border-border/80 card-elevated">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
        <CardTitle className="flex items-center gap-2.5 text-base sm:text-lg">
          <CheckSquare className="h-4 w-4 text-blue-400" />
          Tugas & Deadline Terdekat
        </CardTitle>
        <Link
          href="/tugas"
          className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          Semua Tugas
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-4 space-y-2.5">
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-xs sm:text-sm">
            Semua tugas akademik telah tuntas.
          </div>
        ) : (
          tasks.slice(0, 5).map((t) => {
            const isDone = t.status === "DONE";
            const relative = t.dueAt ? formatRelativeTimeIndonesian(t.dueAt) : null;

            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/25 border border-border/60 hover:bg-muted/50 transition-all group"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => handleToggle(t.id, t.status)}
                    className="mt-0.5 text-muted-foreground hover:text-amber-400 transition-colors shrink-0"
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Circle className="h-5 w-5 hover:text-amber-400" />
                    )}
                  </button>
                  <div className="space-y-1 min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold truncate ${
                        isDone ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {t.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {t.course && (
                        <span className="font-medium text-foreground/80">
                          {t.course.name}
                        </span>
                      )}
                      {relative && (
                        <span
                          className={`font-semibold ${
                            relative.isOverdue ? "text-rose-400" : "text-amber-400"
                          }`}
                        >
                          • {relative.text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <Badge
                  variant={
                    t.priority === "urgent"
                      ? "destructive"
                      : t.priority === "high"
                      ? "gold"
                      : "secondary"
                  }
                  className="text-[10px] shrink-0"
                >
                  {t.priority}
                </Badge>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
