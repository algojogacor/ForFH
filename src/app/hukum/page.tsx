"use client";

import React, { useState } from "react";
import { ArrowLeft, Loader2, BookmarkPlus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { LawSearch } from "@/components/legal/LawSearch";
import { AiLawExplainer } from "@/components/legal/AiLawExplainer";
import { useToast } from "@/components/ui/Toast";
import { PasalSearchResultItem, PasalLawDetail } from "@/lib/legal/types";

export default function LegalResearchPage() {
  const { toast, success } = useToast();
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [lawDetail, setLawDetail] = useState<PasalLawDetail | null>(null);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const handleSelectLaw = async (frbrUri: string) => {
    setSelectedUri(frbrUri);
    setIsLoadingDetail(true);
    try {
      const cleanUri = frbrUri.replace(/^\//, "");
      const res = await fetch(`/api/legal/law/${cleanUri}`);
      const data = await res.json();
      setLawDetail(data.law || null);
    } catch (err) {
      toast("Gagal memuat detail peraturan perundang-undangan.");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleBookmark = async (item: PasalSearchResultItem) => {
    try {
      await fetch("/api/legal/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frbrUri: item.frbr_uri,
          title: item.title,
          type: item.type,
          number: item.number,
          year: item.year,
        }),
      });
      success(`Peraturan "${item.title}" disimpan ke bookmark.`);
    } catch (err) {
      toast("Gagal menyimpan bookmark.");
    }
  };

  return (
    <AppShell>
      <PageContainer variant={selectedUri ? "reading" : "wide"}>
        {/* Header */}
        {!selectedUri ? (
          <PageHeader
            title="Riset Hukum"
            editorial
            description="Akses basis data peraturan perundang-undangan nasional dan analisis pasal."
          />
        ) : null}

        {/* Selected Law View or Search */}
        {selectedUri ? (
          <div className="space-y-4 animate-fade-in">
            <button
              onClick={() => {
                setSelectedUri(null);
                setLawDetail(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pb-2 border-b border-border-default w-full"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Kembali ke Pencarian Hukum</span>
            </button>

            {isLoadingDetail ? (
              <div className="py-16 text-center text-xs text-muted-foreground space-y-2">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
                <p>Memuat naskah peraturan...</p>
              </div>
            ) : lawDetail ? (
              <div className="space-y-4">
                {/* Law Header Card */}
                <div className="p-4 sm:p-5 rounded-lg border border-border-default bg-surface-1 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {lawDetail.type} {lawDetail.number ? `No. ${lawDetail.number}` : ""} {lawDetail.year ? `Tahun ${lawDetail.year}` : ""}
                        </Badge>
                        <Badge
                          variant={lawDetail.status === "berlaku" ? "success" : "warning"}
                          className="text-[10px] uppercase font-mono"
                        >
                          {lawDetail.status || "Berlaku"}
                        </Badge>
                      </div>
                      <h1 className="text-base sm:text-lg font-bold text-foreground leading-snug">
                        {lawDetail.title}
                      </h1>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExplainerOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-foreground hover:bg-surface-3 border border-border-default text-xs font-medium transition-colors"
                      >
                        <span>AI Analisis Pasal</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Articles List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                    Naskah & Pasal Ketentuan
                  </h3>

                  {lawDetail.articles && lawDetail.articles.length > 0 ? (
                    <div className="border border-border-default rounded-lg overflow-hidden bg-surface-1 divide-y divide-border-subtle">
                      {lawDetail.articles.map((art) => (
                        <div key={art.number} className="p-4 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground font-mono text-xs">
                              Pasal {art.number}
                            </span>
                            {art.topic && (
                              <span className="text-[11px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.2 rounded">
                                {art.topic}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                            {art.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-5 border border-border-default rounded-lg bg-surface-1 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {lawDetail.content || "Teks lengkap peraturan tersedia pada basis data nasional."}
                    </div>
                  )}
                </div>

                {/* AI Explainer Modal */}
                <AiLawExplainer
                  open={explainerOpen}
                  onOpenChange={setExplainerOpen}
                  lawTitle={lawDetail.title}
                  frbrUri={lawDetail.frbr_uri}
                  lawContent={lawDetail.content}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <LawSearch
            onSelectLaw={handleSelectLaw}
            onBookmark={handleBookmark}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}
