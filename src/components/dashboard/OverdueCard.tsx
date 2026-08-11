"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "../ui/Card";

export function OverdueCard({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <Card className="border-rose-500/30 bg-gradient-to-r from-rose-950/30 via-card to-card card-elevated">
      <CardContent className="p-4 sm:p-5 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="h-9 w-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center border border-rose-500/30">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="label-caps text-rose-400">
              Tugas Melewati Batas Waktu
            </p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {count} tugas memerlukan tindak lanjut segera
            </p>
          </div>
        </div>
        <Link
          href="/tugas?status=OVERDUE"
          className="text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-colors"
        >
          Selesaikan
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
