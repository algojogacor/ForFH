"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { CampusDataCard } from "@/components/campus/CampusDataCard";
import { CAMPUS_JENIS_META } from "@/components/campus/campusMeta";
import { cachedFetch } from "@/lib/client-cache";

interface InfoItem {
  jenis: string;
  data: unknown[];
  updatedAt: string | null;
}

export default function InfoKampusPage() {
  const [info, setInfo] = useState<{ connected: boolean; lastSyncAt: string | null; items: InfoItem[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    cachedFetch("/api/campus/info")
      .then((data) => setInfo(data))
      .catch(() => setInfo({ connected: false, lastSyncAt: null, items: [] }))
      .finally(() => setIsLoading(false));
  }, []);

  const itemsByJenis = new Map(info?.items.map((i) => [i.jenis, i]) || []);
  const rendered = CAMPUS_JENIS_META.filter((meta) => itemsByJenis.has(meta.jenis));
  const emptyJenis = info && info.connected && rendered.length === 0;

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Info Kampus"
          description="Data akademik dan kemahasiswaan yang disinkronkan otomatis dari Kampus Kita — hanya baca."
          metadata={
            info?.connected
              ? `${rendered.length} kategori · sync ${info.lastSyncAt ? new Date(info.lastSyncAt).toLocaleString("id-ID") : "belum pernah"}`
              : ""
          }
        />

        {isLoading ? (
          <div className="py-16 text-center text-xs text-muted-foreground">Memuat data kampus…</div>
        ) : !info?.connected ? (
          <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-6">
            Belum terhubung ke akun kampus.{" "}
            <a href="/login" className="text-foreground font-medium underline">
              Login dengan email kampus
            </a>{" "}
            untuk menyinkronkan data akademik dan kemahasiswaan.
          </div>
        ) : emptyJenis ? (
          <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-6">
            Belum ada data kampus yang tersinkron. Buka{" "}
            <a href="/pengaturan" className="text-foreground font-medium underline">
              Pengaturan
            </a>{" "}
            lalu tekan <span className="font-mono">Sync sekarang</span>.
          </div>
        ) : (
          <div className="space-y-4">
            {rendered.map((meta) => {
              const item = itemsByJenis.get(meta.jenis)!;
              return (
                <CampusDataCard
                  key={meta.jenis}
                  meta={meta}
                  rows={item.data}
                  updatedAt={item.updatedAt}
                />
              );
            })}
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
