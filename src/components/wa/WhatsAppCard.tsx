"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface WaStatus {
  socketState: string;
  botConnected: boolean;
  botPhone: string | null;
  canPair: boolean;
  health: { status: string; lastMessageEvent: number | null };
  myPhone: string | null;
  myStatus: string | null;
}

const BOT_LABEL: Record<string, string> = {
  open: "🟢 Online",
  starting: "🟡 Menghubungkan…",
  connecting: "🟡 Menghubungkan…",
  reconnecting: "🟡 Reconnecting…",
  closing: "🟡 Menutup…",
  logged_out: "🔴 Perlu pairing ulang",
  error: "🔴 Error — pairing ulang",
  stopped: "⚪ Offline",
};

function formatSilent(minutes: number): string {
  if (minutes < 60) return `${minutes} menit`;
  return `${Math.round(minutes / 60)} jam`;
}

export default function WhatsAppCard() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"idle" | "otp">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairState, setPairState] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/status");
      if (res.ok) setStatus(await res.json());
    } catch { /* server belum siap — polling berikutnya */ }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const timer = setInterval(() => void fetchStatus(), 10_000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // OTP & unlink = POST; pairing action = GET (route spec Step 6 — API
  // contract). fetch() default GET tidak akan sampai ke route POST, dan GET
  // pairing butuh cache: "no-store" agar tiap klik benar-benar memanggil
  // server (bukan respons Next.js dari cache).
  async function api(path: string, body?: unknown) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Gagal (${res.status})`);
      return data;
    } finally { setBusy(false); }
  }

  async function apiGet(path: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(path, { method: "GET", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Gagal (${res.status})`);
      return data;
    } finally { setBusy(false); }
  }

  async function requestOtp() {
    try {
      await api("/api/wa/otp/request", { phone });
      setStep("otp");
    } catch (e: any) { setError(e.message); }
  }

  async function verifyOtp() {
    try {
      await api("/api/wa/otp/verify", { phone, otp });
      setStep("idle"); setPhone(""); setOtp("");
      await fetchStatus();
    } catch (e: any) { setError(e.message); }
  }

  async function unlink() {
    if (!window.confirm("Putuskan koneksi WhatsApp?")) return;
    try { await api("/api/wa/unlink"); await fetchStatus(); }
    catch (e: any) { setError(e.message); }
  }

  async function requestPair() {
    try {
      const data = await apiGet("/api/wa/pairing?action=request");
      setPairCode(data.code ?? null);
      setPairState(data.state);
    } catch (e: any) { setError(e.message); }
  }

  const health = status?.health;
  // A6: possibly_silent ≠ unhealthy — tampilkan fakta, bukan alarm;
  // lastMessageEvent null segera setelah connect → basis sehat (lastConnectionUpdate)
  const silentMinutes = health?.lastMessageEvent
    ? Math.floor((Date.now() - health.lastMessageEvent) / 60_000)
    : null;
  const botLabel = status ? BOT_LABEL[status.socketState] ?? status.socketState : "Memuat…";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold">Asisten WhatsApp</CardTitle>
        <CardDescription>Notifikasi & chat asisten via WhatsApp (nomor bot terpusat).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status bot */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{botLabel}</p>
            <p className="text-xs text-muted-foreground">
              {status?.botPhone ? `Nomor bot: ${status.botPhone}` : "Bot belum dipasangkan"}
              {health?.status === "possibly_silent" && silentMinutes != null
                ? ` · online, tak ada pesan masuk sejak ${formatSilent(silentMinutes)}`
                : ""}
            </p>
          </div>
          {status?.canPair && !status.botConnected && (
            <Button size="sm" onClick={requestPair} disabled={busy}>Tampilkan kode</Button>
          )}
        </div>
        {pairCode && (
          <div className="rounded-lg border border-dashed p-3 text-sm">
            <p className="font-mono text-lg font-bold tracking-widest">{pairCode}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buka WhatsApp di HP → Perangkat tertaut → Tautkan perangkat → masukkan kode ini.
              {pairState === "pairing_failed" ? " Kode kedaluwarsa — minta kode baru." : ""}
            </p>
          </div>
        )}

        {/* Binding user */}
        {status?.myStatus === "active" && status.myPhone ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <p className="text-sm">Terhubung: <span className="font-medium">{status.myPhone}</span></p>
            <Button size="sm" variant="outline" onClick={unlink} disabled={busy}>Putuskan</Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm">
              {status?.myStatus === "pending"
                ? "Masukkan kode OTP yang dikirim ke nomor kamu."
                : "Hubungkan nomor WhatsApp kamu untuk notifikasi di chat."}
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="08xxxxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={step === "otp" || busy}
              />
              {step === "otp" ? (
                <>
                  <Input
                    placeholder="6 digit kode"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    disabled={busy}
                    className="w-32"
                  />
                  <Button onClick={verifyOtp} disabled={busy}>Verifikasi</Button>
                </>
              ) : (
                <Button onClick={requestOtp} disabled={busy || !phone.trim()}>Kirim kode</Button>
              )}
            </div>
            {step === "otp" && (
              <button
                className="text-xs text-muted-foreground underline"
                onClick={() => { setStep("idle"); setPhone(""); setOtp(""); }}
              >
                Batalkan / ganti nomor
              </button>
            )}
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
