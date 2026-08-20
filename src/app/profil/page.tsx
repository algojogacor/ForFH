"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserRound,
  BadgeCheck,
  Sun,
  Moon,
  LogOut,
  Settings,
  ArrowRight,
  GraduationCap,
  Building2,
  Calendar,
  Layers,
  Shield,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { clearUserCache } from "@/lib/offline/idb";
import { invalidateClientCache, cachedFetch } from "@/lib/client-cache";
import { CAMPUS_FIELD_LABELS } from "@/components/campus/campusMeta";

interface CampusStatusMhs {
  [key: string]: unknown;
}

export default function ProfilePage() {
  const router = useRouter();
  const { toast, success } = useToast();

  const [user, setUser] = useState<{ id?: string; username?: string; displayName?: string } | null>(null);
  const [campusData, setCampusData] = useState<{
    connected: boolean;
    lastSyncAt: string | null;
    statusMhs: CampusStatusMhs | null;
  }>({
    connected: false,
    lastSyncAt: null,
    statusMhs: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // 1. Detect current active theme
    const isDark = document.documentElement.classList.contains("dark");
    setCurrentTheme(isDark ? "dark" : "light");

    // 2. Load User Profile & Campus Data
    Promise.all([
      fetch("/api/auth/me")
        .then((r) => (r.ok ? r.json() : { user: null }))
        .catch(() => ({ user: null })),
      cachedFetch("/api/campus/info").catch(() => ({ connected: false, lastSyncAt: null, items: [] })),
    ])
      .then(([meRes, campusRes]) => {
        if (meRes.user) {
          setUser(meRes.user);
        }

        if (campusRes && campusRes.connected) {
          const statusItem = campusRes.items?.find((i: any) => i.jenis === "status_mhs");
          const firstRow = statusItem?.data?.[0] || null;
          setCampusData({
            connected: true,
            lastSyncAt: campusRes.lastSyncAt,
            statusMhs: firstRow,
          });
        } else {
          setCampusData({
            connected: false,
            lastSyncAt: null,
            statusMhs: null,
          });
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleThemeChange = (newTheme: "light" | "dark") => {
    setCurrentTheme(newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
    success(`Tema ${newTheme === "dark" ? "Gelap (Warm Charcoal)" : "Terang (Paper & Ink)"} diaktifkan.`);
  };

  const handleLogout = async () => {
    if (!confirm("Apakah Anda yakin ingin keluar dari akun ForFH?")) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await clearUserCache(user?.id);
      invalidateClientCache();
      router.push("/login");
      router.refresh();
    } catch {
      toast("Gagal logout. Silakan coba lagi.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Extract core identity attributes
  const mhs = campusData.statusMhs || {};
  const nim = String(mhs.NIM || mhs.NIM_MHS || "—");
  const nama = String(mhs.NAMA || mhs.NAMA_MHS || mhs.NM_PENGGUNA || user?.displayName || user?.username || "—");
  const prodi = String(mhs.PRODI || mhs.NM_PROGRAM_STUDI || "Ilmu Hukum");
  const jenjang = String(mhs.JENJANG || mhs.NM_JENJANG || "S1");
  const angkatan = String(mhs.ANGKATAN || mhs.THN_ANGKATAN_MHS || "—");
  const statusAkademik = String(mhs.STATUS_AKADEMIK || mhs.NM_STATUS_PENGGUNA || mhs.STATUS || "Aktif");

  // Secondary details from status_mhs
  const excludeKeys = new Set([
    "NIM", "NIM_MHS", "NAMA", "NAMA_MHS", "NM_PENGGUNA",
    "PRODI", "NM_PROGRAM_STUDI", "JENJANG", "NM_JENJANG",
    "ANGKATAN", "THN_ANGKATAN_MHS", "STATUS_AKADEMIK", "NM_STATUS_PENGGUNA", "STATUS",
  ]);
  const additionalEntries = Object.entries(mhs).filter(([k, v]) => !excludeKeys.has(k) && v !== null && v !== undefined && v !== "");

  return (
    <AppShell user={user}>
      <PageContainer variant="standard">
        <PageHeader
          title="Profil Pengguna"
          description="Identitas personal mahasiswa dan preferensi akun aplikasi ForFH."
          metadata={
            campusData.connected && campusData.lastSyncAt
              ? `Sync Kampus Kita: ${new Date(campusData.lastSyncAt).toLocaleString("id-ID")}`
              : ""
          }
        />

        {isLoading ? (
          <div className="py-20 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Memuat profil mahasiswa…</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Header Profile Card */}
            <div className="p-5 sm:p-6 rounded-lg bg-surface-1 border border-border-default shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-surface-3 border-2 border-primary/20 flex items-center justify-center text-xl font-mono font-bold text-foreground shrink-0 select-none shadow-xs">
                  {user?.displayName?.[0] || user?.username?.[0] || "M"}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                      {nama}
                    </h2>
                    {campusData.connected && (
                      <Badge variant="success" className="gap-1">
                        <BadgeCheck className="h-3 w-3" />
                        <span>Terverifikasi Kampus</span>
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">
                    {user?.username ? `@${user.username}` : "Akun ForFH"}
                    {nim !== "—" && ` · NIM ${nim}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {jenjang} {prodi} · Angkatan {angkatan}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border-subtle">
                <Link
                  href="/pengaturan"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border-default bg-surface-2 hover:bg-surface-3 text-xs font-medium text-foreground transition-colors min-h-[40px]"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Pengaturan</span>
                </Link>
              </div>
            </div>

            {/* 2. Section Data Diri Mahasiswa (Dipindah dari Info Kampus) */}
            <Card className="border-border-default">
              <CardHeader className="py-3 px-4 sm:px-5 border-b border-border-default flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <CardTitle className="text-sm font-semibold">Data Diri Mahasiswa</CardTitle>
                    <p className="text-[11px] text-muted-foreground">
                      Disinkronkan otomatis dari akun resmi Kampus Kita.
                    </p>
                  </div>
                </div>
                <Badge variant="info">Kampus Kita</Badge>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-4">
                {!campusData.connected ? (
                  <div className="p-5 rounded-lg bg-surface-2 border border-dashed border-border-default text-center space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Belum terhubung ke akun Kampus Kita. Data identitas resmi belum tersedia.
                    </p>
                    <Link
                      href="/pengaturan"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <span>Hubungkan Akun Kampus di Pengaturan</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* Primary Identity Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="p-3 rounded-md bg-surface-2 border border-border-subtle space-y-0.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                          Nomor Induk Mahasiswa (NIM)
                        </span>
                        <span className="text-xs font-mono font-semibold text-foreground">
                          {nim}
                        </span>
                      </div>

                      <div className="p-3 rounded-md bg-surface-2 border border-border-subtle space-y-0.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                          Tahun Angkatan
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {angkatan}
                        </span>
                      </div>

                      <div className="p-3 rounded-md bg-surface-2 border border-border-subtle space-y-0.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                          Jenjang Pendidikan
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {jenjang}
                        </span>
                      </div>

                      <div className="p-3 rounded-md bg-surface-2 border border-border-subtle space-y-0.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                          Program Studi
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {prodi}
                        </span>
                      </div>

                      <div className="p-3 rounded-md bg-surface-2 border border-border-subtle space-y-0.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                          Status Akademik
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-status-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                          {statusAkademik}
                        </span>
                      </div>

                      <div className="p-3 rounded-md bg-surface-2 border border-border-subtle space-y-0.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                          Fakultas
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {String(mhs.FAKULTAS || "Fakultas Hukum")}
                        </span>
                      </div>
                    </div>

                    {/* Additional Metadata from Campus Kita if any */}
                    {additionalEntries.length > 0 && (
                      <div className="pt-3 border-t border-border-subtle">
                        <h4 className="text-[11px] font-mono font-medium uppercase tracking-wider text-muted-foreground mb-2">
                          Informasi Tambahan
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {additionalEntries.map(([k, v]) => (
                            <div
                              key={k}
                              className="flex items-center justify-between p-2.5 rounded bg-surface-2/60 border border-border-subtle"
                            >
                              <span className="text-muted-foreground font-mono text-[11px]">
                                {CAMPUS_FIELD_LABELS[k] || k}
                              </span>
                              <span className="font-medium text-foreground text-right truncate ml-2">
                                {String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* 3. Section Preferensi Tampilan (Tema) */}
            <Card className="border-border-default">
              <CardHeader className="py-3 px-4 sm:px-5 border-b border-border-default flex flex-row items-center gap-2">
                <Sun className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <CardTitle className="text-sm font-semibold">Tampilan & Tema Aplikasi</CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Pilih estetika tampilan visual antarmuka ForFH sesuai kenyamanan mata Anda.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Light Mode Option */}
                  <button
                    type="button"
                    onClick={() => handleThemeChange("light")}
                    className={`p-4 rounded-lg border text-left transition-all flex items-start gap-3 min-h-[64px] ${
                      currentTheme === "light"
                        ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                        : "border-border-default bg-surface-2/60 hover:bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    <div className="p-2 rounded-md bg-surface-1 border border-border-default text-warning shrink-0">
                      <Sun className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Paper & Ink (Mode Terang)
                        </span>
                        {currentTheme === "light" && (
                          <span className="text-[10px] font-mono font-semibold text-primary">
                            Aktif
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Kanvas krem hangat dengan aksen tinta dusty navy. Identitas utama ForFH.
                      </p>
                    </div>
                  </button>

                  {/* Dark Mode Option */}
                  <button
                    type="button"
                    onClick={() => handleThemeChange("dark")}
                    className={`p-4 rounded-lg border text-left transition-all flex items-start gap-3 min-h-[64px] ${
                      currentTheme === "dark"
                        ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                        : "border-border-default bg-surface-2/60 hover:bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    <div className="p-2 rounded-md bg-surface-1 border border-border-default text-primary shrink-0">
                      <Moon className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Warm Charcoal (Mode Gelap)
                        </span>
                        {currentTheme === "dark" && (
                          <span className="text-[10px] font-mono font-semibold text-primary">
                            Aktif
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Nuansa arang hangat dengan aksen cobalt bercahaya untuk kenyamanan di malam hari.
                      </p>
                    </div>
                  </button>
                </div>

                {/* Direct Link to Comprehensive Settings */}
                <div className="p-3 rounded-lg bg-surface-2/60 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3">
                  <div className="text-xs text-muted-foreground">
                    Pengaturan lanjutan (WhatsApp Assistant, Notifikasi Web Push, AI ForFH, dan Zona Waktu) dikelola di menu Pengaturan.
                  </div>
                  <Link
                    href="/pengaturan"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    <span>Buka Pengaturan Lengkap</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* 4. Section Sesi & Keamanan Akun (Logout) */}
            <Card className="border-border-default">
              <CardHeader className="py-3 px-4 sm:px-5 border-b border-border-default flex flex-row items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <CardTitle className="text-sm font-semibold">Sesi & Keamanan Akun</CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Kelola autentikasi sesi login pada peramban ini.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">
                    Keluar dari Sesi Perangkat Ini
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Menghapus token autentikasi aktif dan membersihkan data cache offline lokal.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-status-danger-subtle hover:bg-status-danger/20 border border-status-danger/30 text-status-danger text-xs font-semibold transition-colors min-h-[44px] shrink-0 disabled:opacity-50"
                >
                  {isLoggingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  <span>Keluar dari Akun</span>
                </button>
              </CardContent>
            </Card>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
