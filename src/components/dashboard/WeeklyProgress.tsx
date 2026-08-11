"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Progress } from "../ui/Progress";

export function WeeklyProgress({
  completedCount,
  totalCount,
}: {
  completedCount: number;
  totalCount: number;
}) {
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;

  return (
    <Card className="border-border/80 card-elevated">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Progres Tugas Pekan Ini
          </CardTitle>
          <span className="font-display text-base font-bold text-amber-300">{percentage}%</span>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <Progress value={percentage} indicatorColor="bg-gradient-to-r from-amber-500 to-amber-400" shimmer={percentage < 100} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedCount} tuntas</span>
          <span>{Math.max(0, totalCount - completedCount)} tersisa</span>
        </div>
      </CardContent>
    </Card>
  );
}
