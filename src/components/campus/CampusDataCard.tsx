"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AttendanceRecap } from "@/components/attendance/AttendanceRecap";
import { CAMPUS_FIELD_LABELS, type CampusJenisMeta } from "./campusMeta";

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "—";
    }
  }
  return String(v);
}

// Tabel generik dari baris JSON Kampus Kita: kolom = kunci pertama kali
// ditemukan, cap 8 kolom & 50 baris agar tetap ringkas.
function GenericTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!cols.includes(k)) cols.push(k);
    }
  }
  const shownCols = cols.slice(0, 8);
  const extraCols = cols.length - shownCols.length;
  const shownRows = rows.slice(0, 50);
  const extraRows = rows.length - shownRows.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[480px]">
        <thead>
          <tr className="border-b border-border-default">
            {shownCols.map((c) => (
              <th
                key={c}
                className="text-left py-1.5 pr-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground whitespace-nowrap"
              >
                {CAMPUS_FIELD_LABELS[c] || c}
              </th>
            ))}
            {extraCols > 0 && (
              <th className="text-left py-1.5 pr-3 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                +{extraCols}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {shownRows.map((r, i) => (
            <tr key={i} className="border-b border-border-subtle last:border-0">
              {shownCols.map((c) => (
                <td key={c} className="py-1.5 pr-3 font-mono text-foreground align-top whitespace-nowrap">
                  {fmtValue(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {extraRows > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">…dan {extraRows} baris lainnya.</p>
      )}
    </div>
  );
}

export function CampusDataCard({
  meta,
  rows,
  updatedAt,
}: {
  meta: CampusJenisMeta;
  rows: unknown[];
  updatedAt?: string | null;
}) {
  const Icon = meta.icon;
  return (
    <Card className="border-border-default">
      <CardHeader className="py-2.5 px-3.5 border-b border-border-default flex flex-row items-center gap-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm">{meta.title}</CardTitle>
          <p className="text-[11px] text-muted-foreground">{meta.description}</p>
        </div>
        <Badge variant="info">Kampus Kita</Badge>
      </CardHeader>
      <CardContent className="p-3.5 space-y-3 text-xs">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Belum ada data untuk kategori ini.</p>
        ) : meta.jenis === "presensi" ? (
          <AttendanceRecap recaps={rows as any[]} updatedAt={updatedAt} />
        ) : (
          <>
            <GenericTable rows={rows as Record<string, unknown>[]} />
            {updatedAt && (
              <p className="text-[11px] font-mono text-muted-foreground">
                sinkron {new Date(updatedAt).toLocaleString("id-ID")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
