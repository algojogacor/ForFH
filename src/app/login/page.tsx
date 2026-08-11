"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export default function LoginPage() {
  const router = useRouter();
  const { toast, success } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage("Username dan password wajib diisi.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Username atau password salah.");
        return;
      }

      success("Selamat datang di ForFH.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setErrorMessage("Terjadi gangguan koneksi. Coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-canvas text-foreground">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="space-y-1 text-center">
          <div className="font-editorial italic text-3xl font-normal tracking-tight text-foreground">
            ForFH
          </div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Academic Operating System
          </p>
        </div>

        {/* Login Form */}
        <div className="border border-border-default rounded-lg bg-surface-1 p-6 space-y-4 shadow-xs">
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {errorMessage && (
              <div className="p-3 rounded bg-status-danger-subtle border border-status-danger/20 text-status-danger text-xs font-medium">
                {errorMessage}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shadow-xs flex items-center justify-center gap-1.5 mt-2"
            >
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Masuk Akun</span>
            </button>
          </form>

          <div className="pt-3 border-t border-border-subtle text-center text-xs text-muted-foreground">
            Belum memiliki akun?{" "}
            <Link
              href="/register"
              className="text-foreground font-semibold hover:underline"
            >
              Daftar Sekarang
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
