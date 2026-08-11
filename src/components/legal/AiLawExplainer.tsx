"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/Dialog";
import { useToast } from "../ui/Toast";

export function AiLawExplainer({
  open,
  onOpenChange,
  lawTitle,
  frbrUri,
  lawContent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lawTitle: string;
  frbrUri?: string;
  lawContent?: string;
}) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanation, setExplanation] = useState<any>(null);

  const handleExplain = async () => {
    setIsExplaining(true);
    try {
      const res = await fetch("/api/ai/explain-law", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawTitle,
          frbrUri,
          lawContent,
          specificQuestion: question.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.explanation) {
        setExplanation(data.explanation);
      }
    } catch (err) {
      toast("Gagal memproses penjelasan AI.");
    } finally {
      setIsExplaining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-xl">
        <DialogHeader>
          <DialogTitle>Analisis Substansi Pasal</DialogTitle>
          <DialogDescription>
            Uraian unsur kaidah hukum dan konteks penerapan praktis dalam studi kasus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-1 text-xs">
          <div className="p-3 rounded-md bg-secondary/50 border border-border-default space-y-0.5">
            <span className="text-[11px] font-mono text-muted-foreground uppercase">
              Peraturan:
            </span>
            <p className="font-semibold text-foreground">{lawTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Pertanyaan spesifik? (e.g. Apa unsur delik pada pasal ini?)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 bg-surface-1 border border-border-default rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={handleExplain}
              disabled={isExplaining}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0 shadow-xs flex items-center gap-1"
            >
              {isExplaining && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Jelaskan</span>
            </button>
          </div>

          {explanation && (
            <div className="space-y-3 pt-2 animate-fade-in text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div className="p-3 rounded-md bg-surface-2 border border-border-default space-y-1">
                <p className="font-semibold text-foreground">Ringkasan:</p>
                <p className="text-muted-foreground leading-relaxed">
                  {explanation.summary}
                </p>
              </div>

              {explanation.articleBreakdown?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                    Unsur & Penerapan:
                  </p>
                  {explanation.articleBreakdown.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-md bg-surface-1 border border-border-default space-y-1"
                    >
                      <p className="font-semibold text-foreground font-mono">{item.articleNumber}</p>
                      <p className="text-muted-foreground leading-relaxed">{item.explanation}</p>
                      {item.practicalContext && (
                        <div className="text-[11px] text-muted-foreground bg-surface-2 p-2 rounded border border-border-default leading-relaxed mt-1">
                          <strong className="text-foreground">Konteks:</strong> {item.practicalContext}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {explanation.keyTakeaway && (
                <div className="p-2.5 rounded-md bg-accent-subtle border border-accent/20 text-xs space-y-0.5">
                  <p className="font-semibold text-primary">Intisari Akademis:</p>
                  <p className="text-foreground leading-relaxed">{explanation.keyTakeaway}</p>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground italic">
                * {explanation.disclaimer}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
