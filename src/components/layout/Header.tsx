"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sun, Moon, LogOut, Command } from "lucide-react";
import { useToast } from "../ui/Toast";
import { clearUserCache } from "@/lib/offline/idb";

export function Header({
  user,
  onOpenCommandMenu,
}: {
  user?: any;
  onOpenCommandMenu: () => void;
  onOpenQuickCapture?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await clearUserCache(user?.id);
      router.push("/login");
      router.refresh();
    } catch (err) {
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
    <header className="sticky top-0 z-20 w-full border-b border-border-subtle bg-canvas/85 backdrop-blur-md h-12 flex items-center justify-between px-4 sm:px-6">
      {/* Global Command / Search Trigger */}
      <div className="flex items-center gap-3 flex-1 max-w-sm">
        <button
          onClick={onOpenCommandMenu}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-full bg-surface-1 hover:bg-surface-2 border border-border-default text-xs text-muted-foreground transition-all shadow-xs"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">Cari tugas, mata kuliah, pasal...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border-default">
            <Command className="h-2.5 w-2.5" /> K
          </kbd>
        </button>
      </div>

      {/* Right Minimal Utilities */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="h-8 w-8 rounded-full hover:bg-surface-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          title="Ubah Tema"
        >
          <Sun className="h-3.5 w-3.5 hidden dark:block text-warning" />
          <Moon className="h-3.5 w-3.5 block dark:hidden text-muted-foreground" />
        </button>

        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="h-8 w-8 rounded-full hover:bg-status-danger-subtle flex items-center justify-center text-muted-foreground hover:text-status-danger transition-colors"
          title="Keluar"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
