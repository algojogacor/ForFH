"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const success = useCallback((msg: string) => addToast(msg, "success"), [addToast]);
  const error = useCallback((msg: string) => addToast(msg, "error"), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none p-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center justify-between gap-3 rounded-2xl p-4 shadow-2xl border backdrop-blur-xl transition-all duration-300 card-elevated animate-slide-up",
              t.type === "success" &&
                "bg-card border-emerald-500/30 text-foreground",
              t.type === "error" &&
                "bg-card border-rose-500/30 text-foreground",
              t.type === "info" &&
                "bg-card border-amber-500/30 text-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              {t.type === "success" && (
                <div className="h-8 w-8 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              )}
              {t.type === "error" && (
                <div className="h-8 w-8 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertCircle className="h-4 w-4" />
                </div>
              )}
              {t.type === "info" && (
                <div className="h-8 w-8 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
                  <Info className="h-4 w-4" />
                </div>
              )}
              <p className="text-xs sm:text-sm font-medium leading-snug">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/40 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (msg: string) => console.log("[Toast]:", msg),
      success: (msg: string) => console.log("[Toast Success]:", msg),
      error: (msg: string) => console.error("[Toast Error]:", msg),
    };
  }
  return ctx;
}
