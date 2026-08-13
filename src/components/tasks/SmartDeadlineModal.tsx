"use client";

import React, { useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { formatDateIndonesian } from "@/lib/utils";
import { invalidateClientCache } from "@/lib/client-cache";

export function SmartDeadlineModal({
  open,
  onOpenChange,
  task,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  onApplied?: () => void;
}) {
  const { toast, success } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [plan, setPlan] = useState<any>(null);

  const handleGenerate = async () => {
    if (!task) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/smart-deadline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          dueAt: task.dueAt,
          courseName: task.course?.name,
          estimatedHours: task.estimatedMinutes ? Math.ceil(task.estimatedMinutes / 60) : 6,
        }),
      });

      const data = await res.json();
      if (data.plan) {
        setPlan(data.plan);
      }
    } catch (err) {
      toast("Gagal membuat rencana Smart Deadline.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyPlan = async () => {
    if (!plan || !task) return;
    setIsApplying(true);
    try {
      // 1. Update task with internalTargetAt
      await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internalTargetAt: plan.internalTargetDate,
        }),
      });

      // 2. Add milestones as subtasks
      for (const m of plan.milestones) {
        await fetch(`/api/tasks/${task.id}/subtasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `[${m.phase}] ${m.title}`,
            estimatedMinutes: m.estimatedMinutes,
            dueAt: `${m.scheduledDate}T${m.scheduledTime || "20:00"}:00`,
          }),
        });
      }

      invalidateClientCache();
      success("Rencana Smart Deadline berhasil diterapkan.");
      onOpenChange(false);
      onApplied?.();
    } catch (err) {
      toast("Gagal menerapkan rencana.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-lg">
        <DialogHeader>
          <DialogTitle>Smart Deadline Planner</DialogTitle>
          <DialogDescription>
            Bagi beban kerja secara bertahap dengan target aman 12-24 jam sebelum tenggat waktu resmi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs my-1">
          <div className="p-3 rounded-md bg-secondary/50 border border-border-default space-y-0.5">
            <p className="font-semibold text-foreground">{task?.title}</p>
            <p className="text-muted-foreground">
              Deadline:{" "}
              <span className="text-foreground font-mono">
                {task?.dueAt ? formatDateIndonesian(task.dueAt, true) : "Belum ditentukan"}
              </span>
            </p>
          </div>

          {!plan ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-muted-foreground">
                Susun jadwal pengerjaan bertahap secara otomatis.
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition-opacity shadow-xs"
              >
                {isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Susun Rencana Pengerjaan</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-xs text-status-success bg-status-success-subtle border border-status-success/20 p-2.5 rounded-md font-medium">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>
                  Target Aman: {plan.internalTargetDate} (Buffer {plan.bufferHours} jam)
                </span>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  Tahapan Pengerjaan:
                </p>
                {plan.milestones.map((m: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-md bg-surface-2 border border-border-default flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground mr-1.5">[{m.phase}]</span>
                      <span className="text-foreground">{m.title}</span>
                      <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        Jadwal: {m.scheduledDate} {m.scheduledTime ? `pukul ${m.scheduledTime}` : ""}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                      {m.estimatedMinutes}m
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
                <button
                  type="button"
                  onClick={() => setPlan(null)}
                  disabled={isApplying}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Hitung Ulang
                </button>
                <button
                  type="button"
                  onClick={handleApplyPlan}
                  disabled={isApplying}
                  className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 rounded-md shadow-xs transition-colors"
                >
                  {isApplying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>Terapkan Rencana</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
