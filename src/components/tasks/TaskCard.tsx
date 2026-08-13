"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
  Edit,
  Trash2,
  ListTodo,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { SubtaskList } from "./SubtaskList";
import { SmartDeadlineModal } from "./SmartDeadlineModal";
import { formatDateIndonesian, formatRelativeTimeIndonesian } from "@/lib/utils";
import { invalidateClientCache } from "@/lib/client-cache";

export function TaskCard({
  task,
  onTaskUpdated,
  onEdit,
  onDelete,
}: {
  task: any;
  onTaskUpdated: () => void;
  onEdit: (task: any) => void;
  onDelete: (taskId: string) => void;
}) {
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [smartDeadlineOpen, setSmartDeadlineOpen] = useState(false);
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  const isDone = task.status === "DONE";
  const relative = task.dueAt ? formatRelativeTimeIndonesian(task.dueAt) : null;
  const isOverdue = task.computedStatus === "OVERDUE" || (relative && relative.isOverdue && !isDone);

  const handleToggleDone = async () => {
    const nextStatus = isDone ? "NOT_STARTED" : "DONE";

    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      invalidateClientCache();
      onTaskUpdated();
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  };

  const handleAIAutoBreakdown = async () => {
    setIsBreakingDown(true);
    try {
      const res = await fetch("/api/ai/breakdown-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          courseName: task.course?.name,
          type: task.type,
        }),
      });

      const data = await res.json();
      if (data.breakdown?.subtasks) {
        for (const st of data.breakdown.subtasks) {
          await fetch(`/api/tasks/${task.id}/subtasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: st.title,
              estimatedMinutes: st.estimatedMinutes,
            }),
          });
        }
        invalidateClientCache();
        setShowSubtasks(true);
        onTaskUpdated();
      }
    } catch (err) {
      console.error("AI breakdown failed:", err);
    } finally {
      setIsBreakingDown(false);
    }
  };

  const subtasksCount = task.subtasks?.length || 0;
  const completedSubtasksCount = task.subtasks?.filter((s: any) => s.completed === 1).length || 0;

  return (
    <Card
      className={`border-border-default transition-colors ${
        isOverdue ? "border-status-danger/40 bg-status-danger-subtle/30" : isDone ? "opacity-60" : ""
      }`}
    >
      <CardContent className="p-4 space-y-2.5">
        {/* Top bar: Course Pill, Priority, Type */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-secondary text-foreground text-[11px] font-mono border border-border-default">
              {task.course?.name || "Umum"}
            </span>
            <span className="text-muted-foreground capitalize text-[11px] font-mono">
              · {task.type}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge
              variant={
                task.priority === "urgent"
                  ? "destructive"
                  : task.priority === "high"
                  ? "warning"
                  : "secondary"
              }
              className="text-[10px]"
            >
              {task.priority}
            </Badge>

            <button
              onClick={() => onEdit(task)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Edit Tugas"
              aria-label="Edit Tugas"
            >
              <Edit className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-1 rounded text-muted-foreground hover:text-status-danger hover:bg-status-danger-subtle transition-colors"
              title="Hapus Tugas"
              aria-label="Hapus Tugas"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Task Title & Description */}
        <div className="flex items-start gap-2.5">
          <button
            onClick={handleToggleDone}
            className="mt-0.5 text-muted-foreground hover:text-status-success transition-colors shrink-0"
            aria-label={isDone ? "Tandai tugas belum selesai" : "Tandai tugas selesai"}
          >
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 text-status-success" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
          </button>
          <div className="space-y-0.5 flex-1 min-w-0">
            <h4
              className={`text-sm font-semibold leading-snug ${
                isDone ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {task.title}
            </h4>
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{task.description}</p>
            )}
          </div>
        </div>

        {/* Deadline & Target Info */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1.5 border-t border-border-subtle">
          {task.dueAt && (
            <span
              className={`flex items-center gap-1 font-mono text-[11px] ${
                isOverdue ? "text-status-danger font-medium" : "text-muted-foreground"
              }`}
            >
              <Calendar className="h-3 w-3" />
              {formatDateIndonesian(task.dueAt, true)}
              {relative && <span>({relative.text})</span>}
            </span>
          )}

          {task.internalTargetAt && (
            <span className="flex items-center gap-1 text-muted-foreground font-mono text-[11px]">
              <Clock className="h-3 w-3" />
              Target: {formatDateIndonesian(task.internalTargetAt, true)}
            </span>
          )}
        </div>

        {/* Subtask Progress & AI Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() => setShowSubtasks(!showSubtasks)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ListTodo className="h-3.5 w-3.5" />
            <span>
              Subtugas ({completedSubtasksCount}/{subtasksCount})
            </span>
            {showSubtasks ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          <div className="flex items-center gap-1.5">
            {subtasksCount === 0 && (
              <button
                onClick={handleAIAutoBreakdown}
                disabled={isBreakingDown}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-foreground hover:bg-surface-3 border border-border-default transition-colors"
              >
                <span>AI Pecah Tugas</span>
              </button>
            )}

            {task.dueAt && !task.internalTargetAt && (
              <button
                onClick={() => setSmartDeadlineOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-foreground hover:bg-surface-3 border border-border-default transition-colors"
              >
                <span>Smart Deadline</span>
              </button>
            )}
          </div>
        </div>

        {/* Expanded Subtask List */}
        {showSubtasks && (
          <div className="pt-2 border-t border-border-subtle animate-fade-in">
            <SubtaskList
              taskId={task.id}
              subtasks={task.subtasks || []}
              onSubtasksUpdated={onTaskUpdated}
            />
          </div>
        )}
      </CardContent>

      <SmartDeadlineModal
        open={smartDeadlineOpen}
        onOpenChange={setSmartDeadlineOpen}
        task={task}
        onApplied={onTaskUpdated}
      />
    </Card>
  );
}
