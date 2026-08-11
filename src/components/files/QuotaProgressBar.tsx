"use client";

import React from "react";
import { HardDrive } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { Progress } from "../ui/Progress";

export function QuotaProgressBar({ quota }: { quota?: any }) {
  if (!quota) return null;

  const usedMb = (quota.usedBytes / (1024 * 1024)).toFixed(1);
  const limitMb = Math.round(quota.limitBytes / (1024 * 1024));
  const percentage = quota.usedPercentage || 0;

  return (
    <Card className="border-border-default bg-surface-1">
      <CardContent className="p-3.5 space-y-2 text-xs">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Kapasitas Penyimpanan</span>
          </span>
          <span className="font-mono text-muted-foreground text-[11px]">
            {usedMb} MB / {limitMb} MB ({percentage}%)
          </span>
        </div>
        <Progress value={percentage} />
      </CardContent>
    </Card>
  );
}
