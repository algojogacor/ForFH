"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { CommandMenu } from "./CommandMenu";
import { QuickCaptureModal } from "../quick-capture/QuickCaptureModal";
import { initAutoSyncListener } from "@/lib/offline/outbox";

export function AppShell({
  user,
  children,
}: {
  user?: any;
  children: React.ReactNode;
}) {
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker for PWA and Push
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          // Service worker registered
        })
        .catch((err) => {
          console.warn("Service worker registration skipped:", err);
        });
    }

    // 2. Initialize offline outbox automatic sync listeners
    initAutoSyncListener();

    // 3. Global Keyboard Shortcut: Cmd/Ctrl + K for Command Menu
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandMenuOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen bg-canvas text-primary selection:bg-accent-subtle selection:text-primary">
      {/* Desktop Sidebar */}
      <Sidebar user={user} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-8">
        <Header
          user={user}
          onOpenCommandMenu={() => setCommandMenuOpen(true)}
          onOpenQuickCapture={() => setQuickCaptureOpen(true)}
        />
        <main className="flex-1 p-3 sm:p-5 md:p-6 w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        onOpenQuickCapture={() => setQuickCaptureOpen(true)}
        onOpenCommandMenu={() => setCommandMenuOpen(true)}
      />

      {/* Quick Capture Floating Dialog */}
      <QuickCaptureModal
        open={quickCaptureOpen}
        onOpenChange={setQuickCaptureOpen}
        onTaskCreated={() => {
          window.location.reload();
        }}
      />

      {/* Universal Command Menu (Ctrl+K) */}
      <CommandMenu
        open={commandMenuOpen}
        onOpenChange={setCommandMenuOpen}
      />
    </div>
  );
}
