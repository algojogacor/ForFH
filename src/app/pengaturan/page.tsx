"use client";

import React, { useState, useEffect } from "react";
import { Bell, Loader2, Check } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

export default function SettingsPage() {
  const { toast, success } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [classOffsets, setClassOffsets] = useState<number[]>([240, 60, 30]);
  const [taskOffsets, setTaskOffsets] = useState<number[]>([10080, 4320, 1440, 60]);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setDisplayName(data.user?.displayName || "");
          setTimezone(data.settings.timezone || "Asia/Jakarta");
          setClassOffsets(data.settings.classReminderOffsets || [240, 60, 30]);
          setTaskOffsets(data.settings.taskReminderOffsets || [10080, 4320, 1440, 60]);
          setAiEnabled(data.settings.aiEnabled !== false);
        }
      })
      .catch(() => {});

    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setIsPushSupported(true);
    }
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          timezone,
          classReminderOffsets: classOffsets,
          taskReminderOffsets: taskOffsets,
          aiEnabled,
        }),
      });
      success("Pengaturan berhasil disimpan.");
    } catch (err) {
      toast("Gagal menyimpan pengaturan.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubscribePush = async () => {
    if (!isPushSupported) {
      toast("Browser Anda tidak mendukung Web Push.");
      return;
    }

    setIsSubscribingPush(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BEe_MOCK_VAPID_PUBLIC_KEY",
      });

      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });

      success("Notifikasi Web Push berhasil diaktifkan.");
    } catch (err) {
      toast("Izin notifikasi ditolak atau dibatalkan.");
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleTestPush = async () => {
    setIsSendingTestPush(true);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        success(data.message || "Notifikasi pengujian berhasil dikirim.");
      } else {
        toast(data.error || "Gagal mengirim notifikasi.");
      }
    } catch (err) {
      toast("Gagal mengirim notifikasi tes.");
    } finally {
      setIsSendingTestPush(false);
    }
  };

  return (
    <AppShell>
      <PageContainer variant="standard">
        <PageHeader
          title="Pengaturan"
          description="Profil pengguna, preferensi zona waktu, dan notifikasi."
        />

        <form onSubmit={handleSaveSettings} className="space-y-4">
          {/* Profile & Timezone */}
          <Card className="border-border-default">
            <CardHeader className="py-2.5 px-3.5 border-b border-border-default">
              <CardTitle className="text-xs font-semibold">Profil & Zona Waktu</CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 space-y-3 text-xs">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Nama Tampilan
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nama Lengkap"
                  className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Zona Waktu
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="Asia/Jakarta">WIB — Asia/Jakarta (UTC+7)</option>
                  <option value="Asia/Makassar">WITA — Asia/Makassar (UTC+8)</option>
                  <option value="Asia/Jayapura">WIT — Asia/Jayapura (UTC+9)</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Web Push Notification Settings */}
          <Card className="border-border-default">
            <CardHeader className="py-2.5 px-3.5 border-b border-border-default">
              <CardTitle className="text-xs font-semibold">Pengingat Notifikasi Web Push</CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md bg-secondary/50 border border-border-default">
                <div>
                  <p className="font-semibold text-foreground text-xs">
                    Notifikasi Perangkat Ini
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Terima pengingat jadwal kuliah dan deadline tugas.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSubscribePush}
                    disabled={isSubscribingPush}
                    className="px-3 py-1.5 rounded-md bg-surface-1 hover:bg-surface-2 border border-border-default text-xs font-medium text-foreground transition-colors disabled:opacity-50"
                  >
                    Aktifkan Notifikasi
                  </button>
                  <button
                    type="button"
                    onClick={handleTestPush}
                    disabled={isSendingTestPush}
                    className="px-3 py-1.5 rounded-md bg-secondary hover:bg-surface-3 border border-border-default text-xs font-medium text-foreground transition-colors disabled:opacity-50"
                  >
                    Tes Kirim
                  </button>
                </div>
              </div>

              {/* Reminder Offsets */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block">
                  Jadwal Pengingat Kuliah Otomatis:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { label: "4 Jam Sebelumnya", value: 240 },
                    { label: "2 Jam Sebelumnya", value: 120 },
                    { label: "1 Jam Sebelumnya", value: 60 },
                    { label: "30 Menit Sebelumnya", value: 30 },
                  ].map((item) => (
                    <label
                      key={item.value}
                      className="flex items-center gap-2 p-2 rounded-md border border-border-default bg-surface-1 cursor-pointer hover:bg-surface-2 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={classOffsets.includes(item.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setClassOffsets([...classOffsets, item.value]);
                          } else {
                            setClassOffsets(classOffsets.filter((x) => x !== item.value));
                          }
                        }}
                        className="rounded border-border-default text-primary focus:ring-ring"
                      />
                      <span className="text-foreground text-xs">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Settings */}
          <Card className="border-border-default">
            <CardHeader className="py-2.5 px-3.5 border-b border-border-default">
              <CardTitle className="text-xs font-semibold">Integrasi AI Asisten</CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 text-xs">
              <label className="flex items-center justify-between p-3 rounded-md border border-border-default bg-surface-1 cursor-pointer hover:bg-surface-2 transition-colors">
                <div>
                  <p className="font-semibold text-foreground text-xs">
                    Aktifkan Fitur AI ForFH
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Fitur ekstraksi tugas otomatis, Smart Deadline, ringkasan catatan, dan analisis pasal.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border-default text-primary focus:ring-ring"
                />
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition-opacity shadow-xs disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>Simpan Pengaturan</span>
            </button>
          </div>
        </form>
      </PageContainer>
    </AppShell>
  );
}
