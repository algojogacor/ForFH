"use client";

import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { WeeklyTimetable } from "@/components/schedule/WeeklyTimetable";
import { ScheduleFormModal } from "@/components/schedule/ScheduleFormModal";

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [schedRes, courseRes] = await Promise.all([
        fetch("/api/schedules").then((r) => r.json()),
        fetch("/api/courses").then((r) => r.json()),
      ]);
      setSchedules(schedRes.schedules || []);
      setCourses(courseRes.courses || []);
    } catch (err) {
      console.error("Failed to load schedule data:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateNew = () => {
    setSelectedSchedule(null);
    setModalOpen(true);
  };

  const handleEdit = (schedule: any) => {
    setSelectedSchedule(schedule);
    setModalOpen(true);
  };

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Jadwal Perkuliahan"
          description="Jadwal kuliah mingguan dan alokasi ruang perkuliahan."
          metadata={`${schedules.length} slot jadwal`}
          action={
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 rounded-md shadow-xs transition-colors select-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Jadwal</span>
            </button>
          }
        />

        {/* Weekly Timetable Grid */}
        <WeeklyTimetable
          schedules={schedules}
          onEditSchedule={handleEdit}
        />

        {/* Schedule Form Modal */}
        <ScheduleFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          scheduleToEdit={selectedSchedule}
          courses={courses}
          onSaved={fetchData}
        />
      </PageContainer>
    </AppShell>
  );
}
