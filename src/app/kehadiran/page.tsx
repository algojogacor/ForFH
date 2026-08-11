"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { AttendanceTable } from "@/components/attendance/AttendanceTable";
import { useToast } from "@/components/ui/Toast";

export default function AttendancePage() {
  const { toast, success } = useToast();
  const [courseStats, setCourseStats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAttendance = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/attendance");
      const data = await res.json();
      setCourseStats(data.courseStats || []);
    } catch (err) {
      console.error("Failed to load attendance:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
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
          description="Rekapitulasi kehadiran per mata kuliah dengan syarat batas minimal 75% UTS/UAS."
          metadata={`${courseStats.length} mata kuliah`}
        />

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
