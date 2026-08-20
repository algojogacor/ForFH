"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Download,
  Settings,
  Building2,
  X,
  ArrowRight,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "../ui/Toast";
import { clearUserCache } from "@/lib/offline/idb";
import { invalidateClientCache } from "@/lib/client-cache";

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

interface MobileMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: any;
}

export function MobileMenuDrawer({
  open,
  onOpenChange,
  user,
}: MobileMenuDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleNavigate = (href: string) => {
    onOpenChange(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await clearUserCache(user?.id);
      invalidateClientCache();
      onOpenChange(false);
      router.push("/login");
      router.refresh();
    } catch {
      toast("Gagal logout. Coba lagi.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains("dark");
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end animate-fade-in">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Bottom Sheet Drawer */}
      <div
        className="relative z-50 w-full max-h-[88vh] bg-surface-1 border-t border-border-default rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Menu Navigasi Mobile"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Grab Handle */}
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-border-strong/70" />
        </div>

        {/* Drawer Header */}
        <div className="px-5 py-3.5 border-b border-border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-editorial italic text-xl font-medium tracking-tight text-foreground">
              ForFH
            </span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
              Menu Navigasi
            </span>
          </div>

          <button
            onClick={() => onOpenChange(false)}
            className="min-h-[44px] min-w-[44px] -mr-2 rounded-full flex items-center justify-center text-muted-foreground hover:bg-surface-2 hover:text-foreground active:scale-95 transition-all"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Grouped Menu Links — Scrollable with Breathing Room */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-5 space-y-5">
          {NAV_GROUPS.map((group, index) => (
            <div
              key={group.label}
              className={cn(
                "space-y-1.5",
                index > 0 && "pt-4 border-t border-border-default/60"
              )}
            >
              {/* Group Section Label with Distinct Visual Hierarchy */}
              <div className="px-3.5 pb-0.5 text-[11px] font-mono font-semibold uppercase tracking-widest text-muted-foreground/80 select-none">
                {group.label}
              </div>

              {/* Navigation Items with Generous Tap Targets & Spacing */}
              <div className="space-y-1">
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
                      onClick={() => handleNavigate(item.href)}
                      className={cn(
                        "flex items-center gap-3.5 px-3.5 py-3 min-h-[48px] rounded-lg text-sm font-medium transition-all select-none",
                        isActive
                          ? "bg-primary/10 text-primary font-semibold border-l-4 border-l-primary shadow-xs"
                          : "text-muted-foreground hover:bg-surface-2/80 hover:text-foreground active:bg-surface-3"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <span
                        className={cn(
                          "truncate",
                          isActive ? "text-primary font-semibold" : "text-foreground/90"
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Pengaturan Section with Separator */}
          <div className="space-y-1.5 pt-4 border-t border-border-default/60">
            <div className="px-3.5 pb-0.5 text-[11px] font-mono font-semibold uppercase tracking-widest text-muted-foreground/80 select-none">
              Pengaturan & Akun
            </div>
            <Link
              href="/pengaturan"
              onClick={() => handleNavigate("/pengaturan")}
              className={cn(
                "flex items-center gap-3.5 px-3.5 py-3 min-h-[48px] rounded-lg text-sm font-medium transition-all select-none",
                pathname === "/pengaturan"
                  ? "bg-primary/10 text-primary font-semibold border-l-4 border-l-primary shadow-xs"
                  : "text-muted-foreground hover:bg-surface-2/80 hover:text-foreground active:bg-surface-3"
              )}
            >
              <Settings
                className={cn(
                  "h-4.5 w-4.5 shrink-0",
                  pathname === "/pengaturan" ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span
                className={cn(
                  pathname === "/pengaturan"
                    ? "text-primary font-semibold"
                    : "text-foreground/90"
                )}
              >
                Pengaturan Aplikasi & WhatsApp
              </span>
            </Link>
          </div>
        </div>

        {/* Drawer Footer: User Profile Tappable Link with Extended Safe Area Padding */}
        <div className="px-4 py-3 border-t border-border-default bg-surface-2/60 shrink-0 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))]">
          <Link
            href="/profil"
            onClick={() => handleNavigate("/profil")}
            className="flex items-center justify-between gap-3 p-2 -mx-2 rounded-lg hover:bg-surface-2 active:bg-surface-3 transition-colors group min-h-[48px]"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-full bg-surface-3 flex items-center justify-center text-xs font-mono font-semibold text-foreground shrink-0 select-none border border-border-default shadow-xs group-hover:border-primary/40 transition-colors">
                {user?.displayName?.[0] || user?.username?.[0] || "M"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                  {user?.displayName || user?.username || "Mahasiswa"}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground truncate pt-0.5">
                  {user?.username ? `@${user.username}` : "Akun Terhubung"} · Buka Profil
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors shrink-0">
              <span className="text-[11px] font-medium hidden xs:inline">Profil</span>
              <X className="h-4 w-4 rotate-45 hidden" />
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
