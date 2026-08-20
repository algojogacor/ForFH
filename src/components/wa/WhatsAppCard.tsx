"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, RefreshCw, Smartphone, CheckCircle2, AlertCircle } from "lucide-react";
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
  reconnecting: "🟡 Menghubungkan ulang…",
  closing: "🟡 Menutup…",
  logged_out: "🔴 Perlu scan QR ulang",
  error: "🔴 Terputus — perlu scan QR ulang",
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
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [rawQr, setRawQr] = useState<string | null>(null);
  const [pairState, setPairState] = useState<string | null>(null);
  const [showQrBox, setShowQrBox] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.botConnected) {
          setShowQrBox(false);
          setQrCodeDataUrl(null);
          setRawQr(null);
        }
      }
    } catch { /* server belum siap — polling berikutnya */ }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const timer = setInterval(() => void fetchStatus(), 10_000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // Polling QR / status cepat saat QR box sedang terbuka
  useEffect(() => {
    if (!showQrBox || status?.botConnected) return;

    const pollPairing = async () => {
      try {
        const res = await fetch("/api/wa/pairing", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setPairState(data.state);

        if (data.state === "pairing_success" || data.linked) {
          setShowQrBox(false);
          setQrCodeDataUrl(null);
          setRawQr(null);
          await fetchStatus();
          return;
        }

        if (data.qr && data.qr !== rawQr) {
          setRawQr(data.qr);
          const dataUrl = await QRCode.toDataURL(data.qr, {
            margin: 2,
            width: 256,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
          setQrCodeDataUrl(dataUrl);
        }
      } catch { /* polling fail-safe */ }
    };

    const interval = setInterval(() => void pollPairing(), 3_000);
    return () => clearInterval(interval);
  }, [showQrBox, rawQr, status?.botConnected, fetchStatus]);

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

  async function requestPairQr() {
    setShowQrBox(true);
    setError(null);
    try {
      const data = await apiGet("/api/wa/pairing?action=request");
      setPairState(data.state);
      if (data.qr) {
        setRawQr(data.qr);
        const dataUrl = await QRCode.toDataURL(data.qr, {
          margin: 2,
          width: 256,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        setQrCodeDataUrl(dataUrl);
      } else {
        setQrCodeDataUrl(null);
      }
      if (data.state === "pairing_success" || data.linked) {
        setShowQrBox(false);
        await fetchStatus();
      }
    } catch (e: any) { setError(e.message); }
  }

  const health = status?.health;
  const silentMinutes = health?.lastMessageEvent
    ? Math.floor((Date.now() - health.lastMessageEvent) / 60_000)
    : null;
  const botLabel = status ? BOT_LABEL[status.socketState] ?? status.socketState : "Memuat…";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold flex items-center gap-2">
          <span>Asisten WhatsApp</span>
        </CardTitle>
        <CardDescription>Notifikasi & chat asisten via WhatsApp (nomor bot terpusat).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status bot */}
        <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
          <div>
            <p className="text-sm font-medium">{botLabel}</p>
            <p className="text-xs text-muted-foreground">
              {status?.botPhone ? `Nomor bot: ${status.botPhone}` : "Bot belum terhubung"}
              {health?.status === "possibly_silent" && silentMinutes != null
                ? ` · online, tak ada pesan masuk sejak ${formatSilent(silentMinutes)}`
                : ""}
            </p>
          </div>
          {status?.canPair && !status.botConnected && (
            <Button size="sm" onClick={requestPairQr} disabled={busy} className="flex items-center gap-1.5">
              <QrCode className="h-4 w-4" />
              <span>{showQrBox ? "Perbarui QR" : "Scan QR Code"}</span>
            </Button>
          )}
        </div>

        {/* QR Code Container */}
        {showQrBox && !status?.botConnected && (
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Tautkan Akun WhatsApp Bot</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowQrBox(false)}
              >
                Tutup
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* QR Image Box */}
              <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-inner border border-slate-200 shrink-0 w-[240px] h-[240px]">
                {qrCodeDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrCodeDataUrl}
                    alt="WhatsApp Pairing QR Code"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground text-center p-4">
                    <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-slate-700">Menyiapkan QR Code dari server WhatsApp…</p>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p className="font-semibold text-foreground text-sm">Langkah menghubungkan:</p>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                  <li>Buka WhatsApp di ponsel bot Anda.</li>
                  <li>Ketuk ikon <strong>Menu (⋮)</strong> di Android atau <strong>Pengaturan</strong> di iPhone.</li>
                  <li>Pilih <strong>Perangkat Tertaut</strong> (<em>Linked Devices</em>).</li>
                  <li>Ketuk tombol <strong>Tautkan Perangkat</strong>.</li>
                  <li>Arahkan kamera ponsel Anda ke QR code di samping.</li>
                </ol>

                {pairState === "pairing_failed" && (
                  <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium pt-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>QR Code kedaluwarsa. Silakan muat ulang QR.</span>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={requestPairQr}
                    disabled={busy}
                    className="h-8 text-xs flex items-center gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
                    <span>Muat Ulang QR</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Binding user */}
        {status?.myStatus === "active" && status.myPhone ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-sm">Nomor Anda: <span className="font-medium">{status.myPhone}</span></p>
            </div>
            <Button size="sm" variant="outline" onClick={unlink} disabled={busy}>Putuskan</Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm">
              {status?.myStatus === "pending"
                ? "Masukkan kode OTP yang dikirim ke nomor Anda."
                : "Hubungkan nomor WhatsApp Anda untuk menerima notifikasi & berinteraksi dengan asisten."}
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
                <Button onClick={requestOtp} disabled={busy || !phone.trim()}>Kirim kode OTP</Button>
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
