import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Download, Sparkles, CheckCircle2, ShieldCheck, ArrowRight, Smartphone, HelpCircle } from "lucide-react";

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
        next: { revalidate: 300 }, // Cache 5 menit
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (_err) {
    return null;
  }
}

export default async function UnduhPage() {
  const release = await getLatestRelease();
  const tagName = release?.tag_name || "v2.3.0";
  const apkAsset = release?.assets?.find((a) => a.name.endsWith(".apk"));
  const downloadUrl =
    apkAsset?.browser_download_url ||
    `https://github.com/algojogacor/ForFH-Android/releases/download/${tagName}/app-release.apk`;

  const highlights = [
    {
      title: "Ikon Baru Minimalis",
      desc: "Desain logo timbangan hukum geometris abstrak elegan dengan tema obsidian black.",
    },
    {
      title: "Widget Home Screen Dipoles",
      desc: "Nama mata kuliah tampil sebagai judul utama dan format lokasi ruangan otomatis diringkas (contoh: 'R. LG02 B').",
    },
    {
      title: "Fitur Pembatalan Tugas (Uncheck)",
      desc: "Tugas yang sudah selesai kini bisa dibatalkan ceklisnya untuk dikembalikan ke daftar aktif.",
    },
    {
      title: "Sistem Kalender 3 Mode & Presensi",
      desc: "Beralih mulus antara Hari Ini, Seminggu, dan Bulan dengan indikator multi-dot agenda kuliah & tugas.",
    },
    {
      title: "Catatan Perubahan & Cek Update In-App",
      desc: "Pantau riwayat versi lengkap dan notifikasi pembaruan langsung di dalam aplikasi.",
    },
  ];

  const installSteps = [
    {
      step: "1",
      title: "Unduh File APK",
      desc: "Ketuk tombol Unduh APK di atas untuk mengunduh paket instalasi resmi ForFH Android.",
    },
    {
      step: "2",
      title: "Izinkan Instalasi",
      desc: "Jika muncul peringatan keamanan browser, pilih 'Tetap Unduh' lalu aktifkan izin 'Install dari sumber tidak dikenal' untuk browser Anda.",
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

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-100 selection:bg-[#5e6ad2] selection:text-white">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-b from-[#5e6ad2]/20 to-transparent blur-[120px] rounded-full" />
      </div>

      {/* Navigation Bar */}
      <header className="relative z-10 max-w-4xl mx-auto px-6 py-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center font-bold text-sm text-[#5e6ad2] group-hover:border-[#5e6ad2]/50 transition-colors">
            ⚖
          </div>
          <span className="font-semibold text-base tracking-tight text-white group-hover:text-neutral-200 transition-colors">
            ForFH
          </span>
        </Link>
        <Link
          href="/"
          className="text-xs font-medium text-neutral-400 hover:text-white px-3 py-1.5 rounded-md border border-neutral-800 hover:border-neutral-700 transition-colors"
        >
          Buka Web Portal →
        </Link>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-3xl mx-auto px-6 pt-4 pb-20 space-y-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5e6ad2]/10 border border-[#5e6ad2]/30 text-[#8b95f6] text-xs font-mono font-medium">
            <span className="w-2 h-2 rounded-full bg-[#5e6ad2] animate-pulse" />
            Rilis Terbaru {tagName}
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            Aplikasi Android Mahasiswa <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
              Fakultas Hukum UNAIR
            </span>
          </h1>

          <p className="text-sm sm:text-base text-neutral-400 max-w-xl mx-auto leading-relaxed">
            Sinkronisasi jadwal kuliah otomatis, fullscreen alarm sebelum kelas, manajemen tugas Todoist, dan widget layar utama minimalis.
          </p>

          {/* Download CTA Card */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={downloadUrl}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#5e6ad2] hover:bg-[#4f5bc0] text-white font-semibold text-sm shadow-lg shadow-[#5e6ad2]/20 hover:shadow-[#5e6ad2]/30 transition-all transform active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              <span>Unduh APK ({tagName})</span>
            </a>
            <a
              href={`https://github.com/algojogacor/ForFH-Android/releases/tag/${tagName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-sm font-medium transition-colors"
            >
              <span>Lihat di GitHub</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
            </a>
          </div>

          <div className="flex items-center justify-center gap-6 pt-2 text-xs text-neutral-500 font-mono">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Bebas Iklan & Aman
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-neutral-400" />
              Android 8.0 (Oreo)+
            </span>
          </div>
        </div>

        {/* Highlights / What's New */}
        <section className="p-6 rounded-2xl bg-[#111113] border border-neutral-800/80 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800/60">
            <Sparkles className="w-4 h-4 text-[#8b95f6]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 font-mono">
              Apa yang baru di versi {tagName}
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-1">
            {highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-neutral-900/50 transition-colors">
                <div className="w-1.5 h-1.5 rounded-full bg-[#5e6ad2] mt-2 shrink-0" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-neutral-200">{item.title}</div>
                  <div className="text-xs text-neutral-400 leading-relaxed">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sideload Installation Guide */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-neutral-400" />
            <h2 className="text-base font-semibold text-neutral-200">
              Panduan Cara Install APK di Android
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {installSteps.map((s) => (
              <div
                key={s.step}
                className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/70 space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold font-mono text-[#8b95f6]">
                    {s.step}
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-200">{s.title}</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed">
            <strong>Catatan Keamanan:</strong> Android mungkin menampilkan peringatan <em>&quot;File ini mungkin berbahaya&quot;</em> karena APK diunduh langsung dari web (bukan Google Play Store). File APK ini 100% aman dan dibangun langsung dari kode sumber resmi ForFH.
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 py-8 text-center text-xs text-neutral-500 font-mono">
        <p>© 2026 ForFH · Fakultas Hukum Universitas Airlangga</p>
      </footer>
    </div>
  );
}
