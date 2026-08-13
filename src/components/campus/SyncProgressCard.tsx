"use client";

import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { invalidateClientCache } from "@/lib/client-cache";

// Label langkah sync dalam Bahasa Indonesia + urutan fase (untuk persen).
const PHASES = ["mulai", "jadwal", "kursus", "tugas", "nilai", "info", "selesai"];
const PHASE_LABELS: Record<string, string> = {
  mulai: "Memulai sinkronisasi…",
  jadwal: "Menyinkronkan jadwal kuliah…",
  kursus: "Menyimpan mata kuliah…",
  tugas: "Menyinkronkan tugas HE-BAT…",
  nilai: "Menyinkronkan nilai…",
  info: "Menyinkronkan info kampus…",
  selesai: "Menyelesaikan…",
};

interface SyncStatus {
  connected: boolean;
  state?: string;
  step?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string;
  lastSyncError?: string | null;
}

export function SyncProgressCard({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [polling, setPolling] = useState(false);

  // Polling 2 detik: terus berjalan selama masih "running", berhenti sendiri
  // saat idle dan tidak ada transisi selesai yang perlu ditampilkan.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = false;

    const tick = async () => {
      if (active) return; // cegah tumpuk saat fetch lambat
      active = true;
      try {
        const res = await fetch("/api/campus/sync-status", { cache: "no-store" });
        if (!res.ok) { setPolling(false); return; }
        const data: SyncStatus = await res.json();
        if (cancelled) return;
        setStatus(data);
        if (data.connected && data.state === "running") {
          setPolling(true);
          timer = setTimeout(tick, 2000);
        } else if (data.connected && data.lastSyncAt &&
                   Date.now() - new Date(data.lastSyncAt).getTime() < 60_000) {
          setPolling(true); // transisi "baru selesai" — poll sebentar lagi, lalu berhenti
          timer = setTimeout(tick, 2000);
        } else {
          setPolling(false);
        }
      } catch {
        setPolling(false); // server tidak terjangkau — berhenti diam-diam
      } finally {
        active = false;
      }
    };

    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  const handleRetry = async () => {
    try {
      await fetch("/api/campus/sync", { method: "POST" });
      invalidateClientCache();
    } catch { /* dibiarkan */ }
    setStatus({ connected: true, state: "running", step: "mulai" });
  };

  if (!status?.connected) return null;
  const running = status.state === "running" || polling;
  const justDone = status.state !== "running" && status.lastSyncStatus === "ok" &&
    status.lastSyncAt && Date.now() - new Date(status.lastSyncAt).getTime() < 60_000;
  const hasError = status.lastSyncStatus === "error" && status.lastSyncError;

  if (!running && !justDone && !hasError) return null;

  const phaseIndex = status.step ? Math.max(0, PHASES.indexOf(status.step)) : 0;
  const percent = Math.min(100, Math.round((phaseIndex / (PHASES.length - 1)) * 100));

  return (
    <div className={`rounded-xl border border-border-default bg-surface-1 p-4 ${className}`}>
      {running ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-foreground">
              {PHASE_LABELS[status.step || "mulai"] || "Menyinkronkan…"}
            </p>
            <span className="text-[10px] tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(8, percent)}%` }}
            />
          </div>
        </div>
      ) : justDone ? (
        <div className="flex items-center gap-2 text-xs text-status-success">
          <CheckCircle2 className="h-4 w-4" />
          Sinkronisasi selesai — data kampus sudah diperbarui.
        </div>
      ) : hasError ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-status-danger min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium">Sinkronisasi gagal</p>
              <p className="text-muted-foreground truncate">{status.lastSyncError}</p>
            </div>
          </div>
          <button
            onClick={handleRetry}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
          </button>
        </div>
      ) : null}
    </div>
  );
}
