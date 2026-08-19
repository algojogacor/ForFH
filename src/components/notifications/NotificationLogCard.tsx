"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RefreshCw, MessageSquare, Bell, CheckCircle2, XCircle, Clock } from "lucide-react";

interface NotificationLogItem {
  id: string;
  entityType: "class" | "task" | "exam";
  title: string;
  offsetMinutes: number;
  offsetLabel: string;
  channel: "whatsapp" | "web_push" | "none";
  status: "SENT" | "FAILED";
  sentAt: string | number;
}

export function NotificationLogCard() {
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/logs");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e: any) {
      setError(e?.message || "Gagal memuat log pengingat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLogs();
    const interval = setInterval(() => void fetchLogs(), 30_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const formatTime = (ts: string | number) => {
    const d = new Date(ts);
    return d.toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    });
  };

  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-500" />
            Riwayat Log Pengingat & WhatsApp
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            Catatan pengiriman otomatis notifikasi jadwal kuliah & tenggat tugas via WhatsApp / Web Push.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
          className="h-8 px-2 text-xs flex items-center gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Segarkan
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="p-3 mb-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-md">
            {error}
          </div>
        )}

        {logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground bg-muted/20 rounded-md border border-dashed border-border">
            Belum ada log pengiriman pengingat. Pengingat akan otomatis tercatat saat jam kuliah atau deadline tugas mendekat.
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-md overflow-hidden bg-background">
            {logs.map((log) => (
              <div key={log.id} className="p-3 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="font-medium text-foreground truncate">{log.title}</div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                      {log.offsetLabel}
                    </span>
                    <span>•</span>
                    <span>{formatTime(log.sentAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Channel Badge */}
                  {log.channel === "whatsapp" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <MessageSquare className="w-3 h-3" />
                      WhatsApp
                    </span>
                  ) : log.channel === "web_push" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <Bell className="w-3 h-3" />
                      Web Push
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-500/10 text-zinc-400">
                      None
                    </span>
                  )}

                  {/* Status Badge */}
                  {log.status === "SENT" ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Terkirim
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400">
                      <XCircle className="w-3 h-3" />
                      Gagal
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
