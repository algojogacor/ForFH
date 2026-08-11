"use client";

import React, { useState } from "react";
import { Plus, Trash2, Clock, CheckCircle2, Circle } from "lucide-react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

export function SubtaskList({
  taskId,
  subtasks = [],
  onSubtasksUpdated,
}: {
  taskId: string;
  subtasks: any[];
  onSubtasksUpdated: () => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsAdding(true);
    try {
      await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setNewTitle("");
      onSubtasksUpdated();
    } catch (err) {
      console.error("Failed to add subtask:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = async (subtaskId: string, currentCompleted: number) => {
    const nextCompleted = currentCompleted === 1 ? 0 : 1;

    try {
      await fetch(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted === 1 }),
      });
      onSubtasksUpdated();
    } catch (err) {
      console.error("Failed to toggle subtask:", err);
    }
  };

  const handleDelete = async (subtaskId: string) => {
    try {
      await fetch(`/api/subtasks/${subtaskId}`, { method: "DELETE" });
      onSubtasksUpdated();
    } catch (err) {
      console.error("Failed to delete subtask:", err);
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {subtasks.map((st) => (
          <div
            key={st.id}
            className="flex items-center justify-between gap-2 p-2 rounded-md bg-secondary/50 hover:bg-secondary border border-border-default transition-colors text-xs group"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => handleToggle(st.id, st.completed)}
                className="text-muted-foreground hover:text-status-success transition-colors shrink-0"
              >
                {st.completed === 1 ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </button>
              <span
                className={`truncate ${
                  st.completed === 1 ? "line-through text-muted-foreground" : "text-foreground font-medium"
                }`}
              >
                {st.title}
              </span>
            </div>

            {st.estimatedMinutes && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0 font-mono">
                <Clock className="h-3 w-3" />
                {st.estimatedMinutes}m
              </span>
            )}

            <button
              type="button"
              onClick={() => handleDelete(st.id)}
              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-status-danger rounded transition-opacity"
              title="Hapus Subtask"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add Subtask Inline Form */}
      <form onSubmit={handleAdd} className="flex items-center gap-2 pt-1">
        <Input
          placeholder="Tambah langkah subtugas..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="h-7 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={isAdding || !newTitle.trim()}
          className="h-7 text-xs shrink-0 gap-1"
        >
          <Plus className="h-3 w-3" />
          Tambah
        </Button>
      </form>
    </div>
  );
}
