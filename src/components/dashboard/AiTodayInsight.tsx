"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "../ui/Card";

export function AiTodayInsight() {
  const [insightData, setInsightData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInsight = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai/daily-insight");
      const data = await res.json();
      if (data.insight) {
        setInsightData(data.insight);
      }
    } catch (err) {
      console.warn("Failed to fetch daily insight:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInsight();
  }, []);

  if (isLoading) {
    return (
      <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-card to-card card-elevated">
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="h-4 w-4 animate-spin" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground animate-pulse">
              Menghitung prioritas dan menyusun rekomendasi tindakan hari ini...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insightData) return null;

  return (
    <Card className="relative overflow-hidden border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-card to-card card-elevated">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2.5 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span className="label-caps text-amber-400">
                Rekomendasi Tindakan AI
              </span>
            </div>

            <p className="text-sm sm:text-base font-medium leading-relaxed text-foreground">
              {insightData.insight}
            </p>

            {insightData.suggestedAction && (
              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>
                  <strong className="text-foreground">Langkah Pertama:</strong>{" "}
                  {insightData.suggestedAction}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={fetchInsight}
            className="p-2 rounded-xl text-muted-foreground hover:text-amber-300 hover:bg-muted/60 transition-colors border border-transparent hover:border-border/60 shrink-0"
            title="Muat Ulang Analisis"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
