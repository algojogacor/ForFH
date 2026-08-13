"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Plus,
  CheckSquare,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav({
  onOpenQuickCapture,
  onOpenCommandMenu,
}: {
  onOpenQuickCapture: () => void;
  onOpenCommandMenu: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi Bawah Mobile"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-1/95 backdrop-blur-md border-t border-border-default px-3 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-lg"
    >
      {/* 1. Beranda */}
      <Link
        href="/"
        className={cn(
          "flex flex-col items-center justify-center min-h-[44px] min-w-[48px] rounded text-[11px] font-medium transition-colors flex-1 relative",
          pathname === "/"
            ? "text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Home className="h-4 w-4 mb-0.5" />
        <span>Beranda</span>
        {pathname === "/" && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />}
      </Link>

      {/* 2. Kalender */}
      <Link
        href="/kalender"
        className={cn(
          "flex flex-col items-center justify-center min-h-[44px] min-w-[48px] rounded text-[11px] font-medium transition-colors flex-1 relative",
          pathname.startsWith("/kalender") || pathname.startsWith("/jadwal")
            ? "text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Calendar className="h-4 w-4 mb-0.5" />
        <span>Kalender</span>
        {(pathname.startsWith("/kalender") || pathname.startsWith("/jadwal")) && (
          <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />
        )}
      </Link>

      {/* 3. Center Quick Capture */}
      <div className="flex-1 flex justify-center items-center">
        <button
          onClick={onOpenQuickCapture}
          className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 active:scale-95 transition-transform shadow-sm"
          title="Tambah Cepat"
          aria-label="Tambah cepat"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* 4. Tugas */}
      <Link
        href="/tugas"
        className={cn(
          "flex flex-col items-center justify-center min-h-[44px] min-w-[48px] rounded text-[11px] font-medium transition-colors flex-1 relative",
          pathname.startsWith("/tugas")
            ? "text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <CheckSquare className="h-4 w-4 mb-0.5" />
        <span>Tugas</span>
        {pathname.startsWith("/tugas") && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />}
      </Link>

      {/* 5. Menu / Search */}
      <button
        onClick={onOpenCommandMenu}
        className="flex flex-col items-center justify-center min-h-[44px] min-w-[48px] rounded text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex-1"
        title="Menu & Perintah"
        aria-label="Menu dan Perintah"
      >
        <Menu className="h-4 w-4 mb-0.5" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
