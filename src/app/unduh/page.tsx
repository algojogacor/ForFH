import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Download, Sparkles, ShieldCheck, Smartphone, HelpCircle, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer } from "@/components/ui/PageContainer";

export const metadata: Metadata = {
  title: "Unduh ForFH Android — Aplikasi Pendamping Mahasiswa FH UNAIR",
  description:
    "Unduh aplikasi resmi ForFH Android untuk sinkronisasi jadwal kuliah, alarm otomatis, tugas Todoist, dan presensi akademik Cybercampus FH UNAIR.",
};

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets?: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/algojogacor/ForFH-Android/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "ForFH-Web",
        },
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (_err) {
    return null;
  }
}

export default async function UnduhPage() {
  const user = await getSessionUser();
  const release = await getLatestRelease();
  const tagName = release?.tag_name || "v2.4.0";
  const apkAsset = release?.assets?.find((a) => a.name.endsWith(".apk"));
  const downloadUrl =
    apkAsset?.browser_download_url ||
    `https://github.com/algojogacor/ForFH-Android/releases/download/${tagName}/app-release.apk`;

  const highlights = [
    {
      title: "Pratinjau Catatan Rilis Online",
      desc: "Intip langsung daftar perubahan versi baru dari GitHub Releases di layar Pengaturan sebelum memutuskan update.",
    },
    {
      title: "Ikon Baru Minimalis",
      desc: "Desain logo timbangan hukum geometris abstrak elegan dengan tema obsidian black.",
    },
    {
      title: "Widget Home Screen Dipoles",
      desc: "Nama mata kuliah tampil sebagai judul utama dan format lokasi ruangan diringkas cerdas (contoh: 'R. LG02 B').",
    },
    {
      title: "Fitur Pembatalan Tugas (Uncheck)",
      desc: "Tugas yang sudah selesai kini bisa dibatalkan ceklisnya untuk dikembalikan ke daftar tugas aktif.",
    },
    {
      title: "Sistem Kalender 3 Mode & Presensi",
      desc: "Beralih mulus antara Hari Ini, Seminggu, dan Bulan dengan indikator multi-dot agenda kuliah & tugas.",
    },
  ];

  const installSteps = [
    {
      step: "1",
      title: "Unduh File APK",
      desc: "Ketuk tombol Unduh APK untuk mengunduh paket instalasi resmi ForFH Android.",
    },
    {
      step: "2",
      title: "Izinkan Instalasi",
      desc: "Jika muncul peringatan browser, pilih 'Tetap Unduh' lalu izinkan 'Install dari sumber tidak dikenal'.",
    },
    {
      step: "3",
      title: "Pasang & Buka Aplikasi",
      desc: "Buka file APK dari panel notifikasi atau folder Download di pengelola berkas, lalu ketuk 'Install'.",
    },
    {
      step: "4",
      title: "Masuk dengan Akun Cybercampus",
      desc: "Buka ForFH dan masuk dengan akun Cybercampus FH UNAIR Anda. Jadwal dan tugas akan tersinkronisasi otomatis.",
    },
  ];

  const content = (
    <div className="space-y-8 animate-entrance">
      {/* 1. Header & Hero Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border-default">
        <div className="space-y-1">
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">
            APLIKASI ANDROID RESMI
          </p>
          <h1 className="font-editorial italic text-3xl sm:text-4xl text-foreground font-normal">
            Unduh ForFH Android
          </h1>
          <p className="text-sm text-secondary max-w-xl leading-relaxed pt-1">
            Sinkronisasi jadwal kuliah otomatis, fullscreen alarm sebelum kelas, manajemen tugas Todoist, dan widget layar utama minimalis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-accent-subtle text-accent border border-accent/20 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {tagName} Rilis Terbaru
          </span>
        </div>
      </div>

      {/* 2. Download Action CTA Card */}
      <div className="p-6 rounded-lg border border-border-default bg-surface-1 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Paket Instalasi Mandiri (APK)
            </h2>
            <p className="text-xs text-secondary">
              Versi rilis stabil untuk perangkat Android 8.0 (Oreo) ke atas. Bebas iklan & terverifikasi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={downloadUrl}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-primary hover:bg-accent-hover text-primary-foreground font-medium text-sm transition-colors shadow-sm"
            >
              <Download className="h-4 w-4" />
              <span>Unduh APK ({tagName})</span>
            </a>

            <a
              href={`https://github.com/algojogacor/ForFH-Android/releases/tag/${tagName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-surface-2 hover:bg-surface-3 border border-border-default text-foreground text-sm font-medium transition-colors"
            >
              <span>Catatan Rilis</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </div>
        </div>

        <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground">
          <span className="flex items-center gap-1 text-status-success">
            <ShieldCheck className="h-3.5 w-3.5" />
            Terverifikasi & Aman
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Smartphone className="h-3.5 w-3.5" />
            Android 8.0+
          </span>
          <span>•</span>
          <span>Target SDK 36</span>
        </div>
      </div>

      {/* 3. Apa yang Baru di Versi Ini */}
      <div className="p-6 rounded-lg border border-border-default bg-surface-1 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="font-editorial italic text-xl text-foreground font-medium">
              Apa yang baru di versi {tagName}
            </h2>
          </div>
          <span className="text-xs font-mono text-muted-foreground">Rilis Terbaru</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-1">
          {highlights.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 p-2 rounded-md hover:bg-surface-2/60 transition-colors">
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-foreground">{item.title}</div>
                <div className="text-xs text-secondary leading-relaxed">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Panduan Cara Install */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground font-semibold">
            Panduan Cara Install APK di HP Android
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {installSteps.map((s) => (
            <div
              key={s.step}
              className="p-4 rounded-md border border-border-default bg-surface-1 shadow-sm space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-1.5">
                <div className="w-6 h-6 rounded-full bg-surface-2 border border-border-default flex items-center justify-center text-xs font-mono font-semibold text-accent">
                  {s.step}
                </div>
                <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                <p className="text-xs text-secondary leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3.5 rounded-md border border-border-default bg-surface-2 text-xs text-secondary leading-relaxed">
          <span className="font-semibold text-foreground">Catatan Keamanan:</span> Android mungkin menampilkan dialog <em>&quot;File ini mungkin berbahaya&quot;</em> karena APK diunduh dari luar Google Play Store. File instalasi ForFH ini resmi dan bebas dari pelacak pihak ketiga.
        </div>
      </div>
    </div>
  );

  if (user) {
    return (
      <AppShell user={user}>
        <PageContainer variant="standard">
          {content}
        </PageContainer>
      </AppShell>
    );
  }

  // Public visitor layout (authentic Paper & Ink)
  return (
    <div className="min-h-screen bg-canvas text-foreground selection:bg-accent-subtle selection:text-primary">
      {/* Top Header */}
      <header className="border-b border-border-default bg-sidebar px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="font-editorial italic text-2xl font-medium tracking-tight text-foreground group-hover:text-primary transition-colors">
              ForFH
            </span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
              OS
            </span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-1 hover:bg-surface-2 border border-border-default text-foreground text-xs font-medium transition-colors shadow-xs"
          >
            <span>Masuk Web Portal</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <PageContainer variant="standard">
          {content}
        </PageContainer>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-default bg-sidebar py-8 text-center text-xs text-muted-foreground font-mono">
        <p>© 2026 ForFH · Fakultas Hukum Universitas Airlangga</p>
      </footer>
    </div>
  );
}
