"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  CheckSquare,
  GraduationCap,
  FileText,
  BookOpen,
  Clock,
  Scale,
  UserCheck,
  Award,
  FolderLock,
  Settings,
  Building2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Utama",
    items: [
      { href: "/", label: "Beranda", icon: Home },
      { href: "/kalender", label: "Kalender", icon: Calendar },
      { href: "/tugas", label: "Tugas", icon: CheckSquare },
    ],
  },
  {
    label: "Akademik",
    items: [
      { href: "/mata-kuliah", label: "Mata Kuliah", icon: GraduationCap },
      { href: "/catatan", label: "Catatan", icon: FileText },
      { href: "/bacaan", label: "Bahan Bacaan", icon: BookOpen },
      { href: "/ujian", label: "Jadwal Ujian", icon: Clock },
      { href: "/info-kampus", label: "Info Kampus", icon: Building2 },
    ],
  },
  {
    label: "Perangkat",
    items: [
      { href: "/hukum", label: "Riset Hukum", icon: Scale },
      { href: "/kehadiran", label: "Presensi", icon: UserCheck },
      { href: "/nilai", label: "Nilai & IPK", icon: Award },
      { href: "/berkas", label: "Berkas", icon: FolderLock },
      { href: "/unduh", label: "Unduh APK", icon: Download },
    ],
  },
];

export function Sidebar({ user }: { user?: any }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-56 border-r border-border-default bg-sidebar h-screen sticky top-0 shrink-0 z-30">
      {/* Brand Header — Editorial Wordmark */}
      <div className="px-5 py-4 border-b border-border-default flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="font-editorial italic text-xl font-medium tracking-tight text-foreground group-hover:text-primary transition-colors">
            ForFH
          </span>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
            OS
          </span>
        </Link>
      </div>

      {/* Grouped Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80 select-none">
              {group.label}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all select-none relative",
                    isActive
                      ? "bg-surface-1 text-foreground font-semibold shadow-xs border-l-2 border-l-primary border-y border-r border-border-default"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Navigation */}
      <div className="p-3 border-t border-border-default space-y-1.5 bg-sidebar">
        <Link
          href="/pengaturan"
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors select-none",
            pathname === "/pengaturan"
              ? "bg-surface-1 text-foreground font-semibold shadow-xs border border-border-default"
              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          )}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Pengaturan</span>
        </Link>

        <div className="px-2.5 py-2 flex items-center gap-2 pt-2 border-t border-border-subtle">
          <div className="h-6 w-6 rounded-full bg-surface-3 flex items-center justify-center text-[11px] font-mono font-medium text-foreground shrink-0 select-none border border-border-default">
            {user?.displayName?.[0] || user?.username?.[0] || "M"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">
              {user?.displayName || user?.username || "Mahasiswa"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
