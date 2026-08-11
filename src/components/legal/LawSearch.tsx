"use client";

import React, { useState } from "react";
import { Search, CheckCircle2, BookmarkPlus } from "lucide-react";
import { Badge } from "../ui/Badge";
import { PASAL_REGULATION_TYPES } from "@/lib/constants";
import { PasalSearchResultItem } from "@/lib/legal/types";

export function LawSearch({
  onSelectLaw,
  onBookmark,
}: {
  onSelectLaw: (frbrUri: string) => void;
  onBookmark?: (item: PasalSearchResultItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("ALL");
  const [results, setResults] = useState<PasalSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const url = new URL("/api/legal/search", window.location.origin);
      url.searchParams.set("q", query.trim());
      if (selectedType !== "ALL") {
        url.searchParams.set("type", selectedType);
      }

      const res = await fetch(url.toString());
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error("Legal search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar Form */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari pasal, istilah hukum, atau judul UU (e.g. wanprestasi, asas legalitas, KUHPerdata)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-surface-1 border border-border-default rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:w-56"
        >
          <option value="ALL">Semua Jenis Peraturan (34 Tipe)</option>
          {PASAL_REGULATION_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.code} - {t.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0 shadow-xs disabled:opacity-50"
        >
          {isSearching ? "Mencari..." : "Cari Hukum"}
        </button>
      </form>

      {/* Results List */}
      <div className="space-y-2 pt-1">
        {isSearching ? (
          <div className="py-12 text-center text-muted-foreground text-xs animate-pulse">
            Mencari peraturan perundang-undangan di basis data Pasal.id...
          </div>
        ) : results.length > 0 ? (
          <div className="border border-border-default rounded-lg overflow-hidden bg-surface-1 divide-y divide-border-subtle">
            {results.map((item) => {
              const isVerified = item.content_verified;
              const statusVariant =
                item.status === "berlaku"
                  ? "success"
                  : item.status === "diubah"
                  ? "warning"
                  : "destructive";

              return (
                <div
                  key={item.frbr_uri}
                  className="p-3.5 sm:p-4 hover:bg-surface-2 transition-colors space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {item.type} {item.number ? `No. ${item.number}` : ""} {item.year ? `Tahun ${item.year}` : ""}
                        </Badge>
                        <Badge variant={statusVariant as any} className="text-[10px] uppercase font-mono">
                          {item.status || "Status Berlaku"}
                        </Badge>
                        {isVerified && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-status-success font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Terverifikasi
                          </span>
                        )}
                      </div>
                      <h4
                        onClick={() => onSelectLaw(item.frbr_uri)}
                        className="font-semibold text-foreground hover:text-primary cursor-pointer transition-colors leading-snug text-sm"
                      >
                        {item.title}
                      </h4>
                    </div>

                    {onBookmark && (
                      <button
                        onClick={() => onBookmark(item)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                        title="Simpan ke Bookmark"
                      >
                        <BookmarkPlus className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {item.snippet && (
                    <p className="text-xs text-muted-foreground leading-relaxed bg-surface-2 p-2.5 rounded-md border border-border-default italic">
                      &quot;{item.snippet}&quot;
                    </p>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => onSelectLaw(item.frbr_uri)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Buka Teks Lengkap →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : hasSearched ? (
          <div className="py-12 text-center text-muted-foreground text-xs space-y-1">
            <p className="font-semibold text-foreground">Tidak ada peraturan yang cocok.</p>
            <p className="text-muted-foreground">Coba kata kunci lain atau ubah filter jenis peraturan.</p>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-xs space-y-1 border border-dashed border-border-default rounded-lg p-6">
            <p className="font-semibold text-foreground text-sm">Pusat Riset Hukum Nasional</p>
            <p className="text-muted-foreground">
              Akses basis data perundang-undangan (UUD 1945, KUHP, KUHPerdata, UU, PP, Perpres, Permen, Putusan MK).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
