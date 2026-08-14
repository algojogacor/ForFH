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

// Waktu kejadian status terakhir, lokal user: "14 Agu 2026, 23.13".
// Dipakai untuk membedakan error/sukses baru vs riwayat lama — tanpa ini,
// pesan error dari sync kemarin tampil identik dengan yang baru saja terjadi.
function formatSyncTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function SyncProgressCard({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [polling, setPolling] = useState(false);
  // Dinaikkan saat retry: efek polling berhenti sendiri saat status idle/error,
  // jadi retry harus menjalankan ulang efek supaya kartu mengikuti sync baru.
  const [pollRestart, setPollRestart] = useState(0);
  // Timestamp retry terakhir yang sukses: grace window agar polling tidak mati
  // di tengah race claim sync (POST fire-and-forget selesai sebelum syncState
  // ditulis jadi "running" oleh background sync).
  const retryAtRef = useRef(0);

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
        if (!res.ok) { if (cancelled) return; setPolling(false); return; }
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
        } else if (Date.now() - retryAtRef.current < 10_000) {
          // Retry baru sukses: claim sync butuh 1-2 round trip Turso, jadi
          // syncState masih bisa terbaca "idle" pada tick pertama — tahan
          // polling beberapa tick lagi, lalu berhenti sendiri (bounded).
          setPolling(true);
          timer = setTimeout(tick, 2000);
        } else {
          setPolling(false);
        }
      } catch {
        if (cancelled) return; // unmount — jangan setState lagi
        setPolling(false); // server tidak terjangkau — berhenti diam-diam
      } finally {
        active = false;
      }
    };

    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [pollRestart]);

  const handleRetry = async () => {
    let ok = false;
    try {
      const res = await fetch("/api/campus/sync", { method: "POST" });
      ok = res.ok;
      invalidateClientCache();
    } catch { /* dibiarkan */ }
    // Efek polling berhenti saat status error — nyalakan ulang supaya kartu
    // mengikuti sync baru (fetch pertama langsung jalan, bukan nunggu 2 detik).
    // Gagal: polling tetap dihidupkan ulang agar kartu terus memantau status
    // endpoint, tanpa status optimis yang menyesatkan.
    if (ok) retryAtRef.current = Date.now();
    setPollRestart((n) => n + 1);
    if (ok) setStatus({ connected: true, state: "running", step: "mulai" });
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
          <span>
            Sinkronisasi selesai — data kampus sudah diperbarui.
            {formatSyncTime(status.lastSyncAt) && (
              <span className="text-muted-foreground"> ({formatSyncTime(status.lastSyncAt)})</span>
            )}
          </span>
        </div>
      ) : hasError ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-status-danger min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium">
                Sinkronisasi gagal
                {formatSyncTime(status.lastSyncAt) && (
                  <span className="font-normal text-muted-foreground">
                    {" "}· {formatSyncTime(status.lastSyncAt)}
                  </span>
                )}
              </p>
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
