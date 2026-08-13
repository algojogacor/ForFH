"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Circle, CheckCircle2, MoreVertical, Edit, Trash2, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskDescription } from "@/components/tasks/TaskDescription";
import { SmartDeadlineModal } from "@/components/tasks/SmartDeadlineModal";
import { useToast } from "@/components/ui/Toast";
import { formatDateIndonesian } from "@/lib/utils";
import { invalidateClientCache } from "@/lib/client-cache";

export default function TasksPage() {
  const { toast, success } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "DONE" | "OVERDUE" | "ALL">("ACTIVE");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<any>(null);
  const [smartDeadlineTask, setSmartDeadlineTask] = useState<any>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [tasksRes, coursesRes] = await Promise.all([
        fetch("/api/tasks").then((r) => r.json()),
        fetch("/api/courses").then((r) => r.json()),
      ]);
      setTasks(tasksRes.tasks || []);
      setCourses(coursesRes.courses || []);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleDone = async (task: any, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    const nextStatus = task.status === "DONE" ? "NOT_STARTED" : "DONE";
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      invalidateClientCache();
      fetchData();
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  };

  const handleCreateNew = () => {
    setTaskToEdit(null);
    setModalOpen(true);
  };

  const handleEdit = (task: any, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setActiveMenuId(null);
    setTaskToEdit(task);
    setModalOpen(true);
  };

  const handleDelete = async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setActiveMenuId(null);
    if (!confirm("Hapus tugas ini?")) return;
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      invalidateClientCache();
      success("Tugas berhasil dihapus.");
      fetchData();
    } catch (err) {
      toast("Gagal menghapus tugas.");
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (searchQuery.trim()) {
      const match =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.course?.name && t.course.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!match) return false;
    }

    if (selectedCourseFilter !== "ALL" && t.courseId !== selectedCourseFilter) {
      return false;
    }

    if (statusFilter === "ACTIVE") return t.status !== "DONE";
    if (statusFilter === "DONE") return t.status === "DONE";
    if (statusFilter === "OVERDUE") return t.computedStatus === "OVERDUE" && t.status !== "DONE";
    return true;
  });

  const completedCount = tasks.filter((t) => t.status === "DONE").length;

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Tugas"
          editorial
          description="Daftar tugas, makalah, dan tenggat waktu akademik."
          metadata={`${completedCount}/${tasks.length} Selesai`}
          action={
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-2 rounded-md shadow-xs transition-colors select-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Tugas</span>
            </button>
          }
        />

        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          {/* Status Tabs */}
          <div className="inline-flex h-8 items-center rounded-md bg-secondary p-0.5 text-xs text-muted-foreground border border-border-default">
            {[
              { key: "ACTIVE", label: "Aktif" },
              { key: "OVERDUE", label: "Terlambat" },
              { key: "DONE", label: "Selesai" },
              { key: "ALL", label: "Semua" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key as any)}
                className={`px-3 py-1 rounded text-xs transition-colors select-none ${
                  statusFilter === tab.key
                    ? "bg-surface-1 text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search and Course Dropdown */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari tugas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-1 border border-border-default rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <select
              value={selectedCourseFilter}
              onChange={(e) => setSelectedCourseFilter(e.target.value)}
              className="h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">Semua MK</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Structured Task Rows List */}
        {filteredTasks.length === 0 && !isLoading ? (
          <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-6 space-y-2">
            <p className="text-foreground font-medium">Tidak ada tugas dalam kategori ini.</p>
            <p className="text-muted-foreground">
              Tambahkan tugas baru untuk mulai mengelola tenggat waktu.
            </p>
          </div>
        ) : (
          <div className="border border-border-default rounded-lg overflow-hidden bg-surface-1 divide-y divide-border-subtle">
            {filteredTasks.map((task) => {
              const isDone = task.status === "DONE";
              const isOverdue = task.computedStatus === "OVERDUE" && !isDone;
              const isMenuOpen = activeMenuId === task.id;
              const subtasksCount = task.subtasks?.length || 0;
              const completedSubtasksCount =
                task.subtasks?.filter((s: any) => s.completed === 1).length || 0;

              return (
                <div
                  key={task.id}
                  onClick={(e) => handleEdit(task, e)}
                  className="p-3 sm:px-4 flex items-start gap-3 hover:bg-surface-2 cursor-pointer transition-colors group relative text-xs"
                >
                  {/* Completion Toggle */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleDone(task, e)}
                    className="mt-0.5 text-muted-foreground hover:text-status-success transition-colors shrink-0"
                    title={isDone ? "Tandai belum selesai" : "Tandai selesai"}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-status-success" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`font-medium truncate ${
                          isDone
                            ? "line-through text-muted-foreground"
                            : isOverdue
                            ? "text-status-danger font-semibold"
                            : "text-foreground"
                        }`}
                      >
                        {task.title}
                      </span>

                      {task.dueAt && (
                        <span
                          className={`font-mono text-[11px] shrink-0 ${
                            isOverdue ? "text-status-danger font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {formatDateIndonesian(task.dueAt, true)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono">
                      <span>{task.course?.name || "Umum"}</span>
                      {task.priority === "urgent" && (
                        <>
                          <span>·</span>
                          <span className="text-status-danger font-medium">Mendesak</span>
                        </>
                      )}
                      {task.priority === "high" && (
                        <>
                          <span>·</span>
                          <span className="text-status-warning font-medium">Tinggi</span>
                        </>
                      )}
                      {subtasksCount > 0 && (
                        <>
                          <span>·</span>
                          <span>
                            {completedSubtasksCount}/{subtasksCount} Subtugas
                          </span>
                        </>
                      )}
                    </div>

                    {/* Instruksi tugas — komponen menyembunyikan diri bila kosong */}
                    <TaskDescription description={task.description} clampLines={2} expandable />
                  </div>

                  {/* Desktop Hover Actions & Mobile Popover */}
                  <div className="shrink-0 flex items-center">
                    {/* Desktop Hover Actions */}
                    <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleEdit(task, e)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
                        title="Edit Tugas"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(task.id, e)}
                        className="p-1 rounded text-muted-foreground hover:text-status-danger hover:bg-status-danger-subtle transition-colors"
                        title="Hapus Tugas"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Mobile Touch Action Button */}
                    <div className="sm:hidden relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : task.id);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-6 z-30 w-32 bg-surface-1 border border-border-default rounded-md shadow-lg py-1 text-xs animate-fade-in"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => handleEdit(task, e)}
                            className="w-full px-3 py-2 text-left text-foreground hover:bg-secondary flex items-center gap-2"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={(e) => handleDelete(task.id, e)}
                            className="w-full px-3 py-2 text-left text-status-danger hover:bg-status-danger-subtle flex items-center gap-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <TaskFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          taskToEdit={taskToEdit}
          courses={courses}
          onSaved={fetchData}
        />

        {smartDeadlineTask && (
          <SmartDeadlineModal
            open={!!smartDeadlineTask}
            onOpenChange={(open) => !open && setSmartDeadlineTask(null)}
            task={smartDeadlineTask}
            onApplied={fetchData}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}
