"use client";

import React, { useState, useEffect } from "react";
import { Filter, TrendingUp, Calendar, CheckCircle2, XCircle, AlertCircle, Clock, Download } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { useToast } from "@/components/ui/Toast";
import { formatDateIndonesian, INDONESIAN_DAYS } from "@/lib/utils";

type AttendanceRecord = {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  classDate: string;
  status: "PRESENT" | "PERMIT" | "SICK" | "ABSENT";
  notes: string | null;
  createdAt: string;
};

type CourseStat = {
  courseId: string;
  courseName: string;
  courseCode: string;
  total: number;
  present: number;
  permit: number;
  sick: number;
  absent: number;
  attendancePercentage: number;
  isBelowThreshold: boolean;
};

const STATUS_META = {
  PRESENT: { label: "Hadir", color: "text-status-success", bg: "bg-status-success-subtle", icon: CheckCircle2 },
  PERMIT: { label: "Izin", color: "text-status-info", bg: "bg-status-info-subtle", icon: Clock },
  SICK: { label: "Sakit", color: "text-status-warning", bg: "bg-status-warning-subtle", icon: AlertCircle },
  ABSENT: { label: "Alpa", color: "text-status-danger", bg: "bg-status-danger-subtle", icon: XCircle },
};

export default function AttendanceRecapPage() {
  const { toast } = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [courseStats, setCourseStats] = useState<CourseStat[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [filterCourse, setFilterCourse] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMonth, setFilterMonth] = useState("ALL");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [attRes, courseRes] = await Promise.all([
        fetch("/api/attendance").then((r) => r.json()),
        fetch("/api/courses").then((r) => r.json()),
      ]);
      setRecords(attRes.records || []);
      setCourseStats(attRes.courseStats || []);
      setCourses(courseRes.courses || []);
    } catch (err) {
      console.error("Failed to load attendance recap:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute available months from records
  const availableMonths = React.useMemo(() => {
    const months = new Set<string>();
    records.forEach((r) => {
      if (r.classDate) {
        months.add(r.classDate.slice(0, 7)); // YYYY-MM
      }
    });
    return Array.from(months).sort().reverse();
  }, [records]);

  // Overall stats
  const overallStats = React.useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === "PRESENT").length;
    const permit = records.filter((r) => r.status === "PERMIT").length;
    const sick = records.filter((r) => r.status === "SICK").length;
    const absent = records.filter((r) => r.status === "ABSENT").length;
    const rate = total > 0 ? Math.round(((present + permit) / total) * 100) : 0;
    return { total, present, permit, sick, absent, rate };
  }, [records]);

  // Filtered records
  const filteredRecords = records.filter((r) => {
    if (filterCourse !== "ALL" && r.courseId !== filterCourse) return false;
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
    if (filterMonth !== "ALL" && !r.classDate?.startsWith(filterMonth)) return false;
    return true;
  });

  const handleExportPrint = () => {
    window.print();
  };

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Rekapitulasi Kehadiran"
          editorial
          description="Riwayat dan statistik kehadiran kuliah per pertemuan."
          metadata={`${records.length} sesi tercatat`}
          action={
            <button
              onClick={handleExportPrint}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-secondary text-foreground hover:bg-surface-3 px-3 py-2 rounded-md border border-border-default transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Cetak / Ekspor</span>
            </button>
          }
        />

        {/* 1. Overall Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
          <Card className="border-border-default">
            <CardContent className="p-3 text-center space-y-1">
              <div className="text-xl font-bold font-mono text-foreground">{overallStats.total}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Total Sesi</div>
            </CardContent>
          </Card>
          <Card className="border-border-default">
            <CardContent className="p-3 text-center space-y-1">
              <div className="text-xl font-bold font-mono text-status-success">{overallStats.rate}%</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Tingkat Hadir</div>
            </CardContent>
          </Card>
          <Card className="border-border-default">
            <CardContent className="p-3 text-center space-y-1">
              <div className="text-xl font-bold font-mono text-status-success">{overallStats.present}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Hadir</div>
            </CardContent>
          </Card>
          <Card className="border-border-default">
            <CardContent className="p-3 text-center space-y-1">
              <div className="text-xl font-bold font-mono text-status-info">{overallStats.permit}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Izin</div>
            </CardContent>
          </Card>
          <Card className="border-border-default">
            <CardContent className="p-3 text-center space-y-1">
              <div className="text-xl font-bold font-mono text-status-warning">{overallStats.sick}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Sakit</div>
            </CardContent>
          </Card>
          <Card className="border-border-default">
            <CardContent className="p-3 text-center space-y-1">
              <div className="text-xl font-bold font-mono text-status-danger">{overallStats.absent}</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Alpa</div>
            </CardContent>
          </Card>
        </div>

        {/* 2. Per-Course Breakdown */}
        <div className="space-y-2 mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Per Mata Kuliah
          </h3>
          {courseStats.length === 0 && !isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg">
              Belum ada data kehadiran.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {courseStats.map((stat) => (
                <Card
                  key={stat.courseId}
                  className={`border-border-default ${
                    stat.isBelowThreshold ? "border-status-danger/40 bg-status-danger-subtle/10" : ""
                  }`}
                >
                  <CardContent className="p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate text-sm">{stat.courseName}</p>
                        {stat.courseCode && (
                          <p className="text-[11px] font-mono text-muted-foreground">{stat.courseCode}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 font-mono text-sm font-bold ${
                          stat.attendancePercentage >= 75
                            ? "text-status-success"
                            : "text-status-danger"
                        }`}
                      >
                        {stat.attendancePercentage}%
                      </span>
                    </div>

                    <Progress value={stat.attendancePercentage} />

                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 text-[11px] font-mono">
                        <span className="text-status-success">{stat.present} H</span>
                        <span className="text-status-info">{stat.permit} I</span>
                        <span className="text-status-warning">{stat.sick} S</span>
                        <span className="text-status-danger">{stat.absent} A</span>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {stat.total} sesi
                      </span>
                    </div>

                    {stat.isBelowThreshold && (
                      <div className="flex items-center gap-1.5 text-[11px] text-status-danger font-medium">
                        <AlertCircle className="h-3 w-3" />
                        <span>Di bawah batas minimal 75% — risiko tidak bisa ikut UTS/UAS</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* 3. Chronological Attendance History */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              Riwayat Kehadiran ({filteredRecords.length})
            </h3>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

              {/* Course Filter */}
              <select
                value={filterCourse}
                onChange={(e) => setFilterCourse(e.target.value)}
                className="h-7 bg-surface-1 border border-border-default rounded px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              >
                <option value="ALL">Semua MK</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-7 bg-surface-1 border border-border-default rounded px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              >
                <option value="ALL">Semua Status</option>
                <option value="PRESENT">Hadir</option>
                <option value="PERMIT">Izin</option>
                <option value="SICK">Sakit</option>
                <option value="ABSENT">Alpa</option>
              </select>

              {/* Month Filter */}
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="h-7 bg-surface-1 border border-border-default rounded px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              >
                <option value="ALL">Semua Bulan</option>
                {availableMonths.map((m) => {
                  const [year, month] = m.split("-");
                  const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
                  return (
                    <option key={m} value={m}>
                      {monthNames[parseInt(month) - 1]} {year}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Records Table */}
          {filteredRecords.length === 0 && !isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg">
              {records.length === 0
                ? "Belum ada rekam kehadiran."
                : "Tidak ada rekam yang cocok dengan filter."}
            </div>
          ) : (
            <div className="border border-border-default rounded-lg overflow-hidden bg-surface-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-default bg-surface-2 text-muted-foreground">
                    <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] font-mono">Tanggal</th>
                    <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] font-mono hidden sm:table-cell">Mata Kuliah</th>
                    <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] font-mono hidden md:table-cell">Hari</th>
                    <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] font-mono">Status</th>
                    <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] font-mono hidden lg:table-cell">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredRecords.map((record) => {
                    const meta = STATUS_META[record.status] || STATUS_META.ABSENT;
                    const StatusIcon = meta.icon;
                    const date = new Date(record.classDate + "T00:00:00");
                    const dayName = INDONESIAN_DAYS[date.getDay()];

                    return (
                      <tr key={record.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-foreground">
                          {formatDateIndonesian(date, false)}
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className="font-medium text-foreground">{record.courseName}</span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground font-mono hidden md:table-cell">
                          {dayName}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${meta.bg} ${meta.color}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">
                          {record.notes || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Print-only footer */}
        <div className="hidden print:block mt-8 pt-4 border-t border-border-default text-xs text-muted-foreground">
          Dicetak dari ForFH Academic Operating System — {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      </PageContainer>
    </AppShell>
  );
}
