"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { AttendanceTable } from "@/components/attendance/AttendanceTable";
import { AttendanceRecap } from "@/components/attendance/AttendanceRecap";
import { useToast } from "@/components/ui/Toast";
import { cachedFetch, invalidateClientCache } from "@/lib/client-cache";

export default function AttendancePage() {
  const { toast, success } = useToast();
  const [courseStats, setCourseStats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [campusRecap, setCampusRecap] = useState<{ recaps: any[]; updatedAt: string | null } | null>(null);

  const fetchAttendance = async () => {
    setIsLoading(true);
    try {
      const data = await cachedFetch("/api/attendance");
      setCourseStats(data.courseStats || []);
    } catch (err) {
      console.error("Failed to load attendance:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
    // Rekap agregat per MK dari Kampus Kita (sync otomatis)
    cachedFetch("/api/campus/info")
      .then((data) => {
        const presensi = (data.items || []).find((i: any) => i.jenis === "presensi");
        if (data.connected && presensi && Array.isArray(presensi.data) && presensi.data.length > 0) {
          setCampusRecap({ recaps: presensi.data, updatedAt: presensi.updatedAt });
        }
      })
      .catch(() => {});
  }, []);

  const handleQuickLog = async (courseId: string, status: string) => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          classDate: todayStr,
          status,
        }),
      });
      invalidateClientCache();
      success("Kehadiran hari ini berhasil dicatat.");
      fetchAttendance();
    } catch (err) {
      toast("Gagal mencatat presensi.");
    }
  };

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Kehadiran Kuliah"
          description="Rekapitulasi kehadiran per mata kuliah dengan syarat batas minimal 75% UTS/UAS. Rekap dari Kampus Kita tersinkron otomatis; catatan per tanggal ditambahkan manual."
          metadata={`${courseStats.length} mata kuliah`}
        />

        {campusRecap && (
          <div className="mb-6">
            <AttendanceRecap recaps={campusRecap.recaps} updatedAt={campusRecap.updatedAt} />
          </div>
        )}

        {courseStats.length === 0 && !isLoading ? (
          <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-6">
            Belum ada mata kuliah terdaftar.
          </div>
        ) : (
          <AttendanceTable
            courseStats={courseStats}
            onQuickLog={handleQuickLog}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}
