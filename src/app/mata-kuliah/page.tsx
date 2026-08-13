"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit, Trash2, MoreVertical } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { CourseFormModal } from "@/components/courses/CourseFormModal";
import { useToast } from "@/components/ui/Toast";
import { INDONESIAN_DAYS } from "@/lib/utils";
import { invalidateClientCache } from "@/lib/client-cache";

export default function CoursesPage() {
  const router = useRouter();
  const { toast, success } = useToast();
  const [courses, setCourses] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/courses");
      const data = await res.json();
      setCourses(data.courses || []);
    } catch (err) {
      console.error("Failed to load courses:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleCreateNew = () => {
    setSelectedCourse(null);
    setModalOpen(true);
  };

  const handleEdit = (course: any, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setActiveMenuId(null);
    setSelectedCourse(course);
    setModalOpen(true);
  };

  const handleDelete = async (courseId: string, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    setActiveMenuId(null);
    if (!confirm("Hapus mata kuliah ini?")) return;
    try {
      await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
      invalidateClientCache();
      success("Mata kuliah berhasil dihapus.");
      fetchCourses();
    } catch (err) {
      toast("Gagal menghapus mata kuliah.");
    }
  };

  const totalCredits = courses.reduce((acc, c) => acc + (c.credits || 0), 0);

  return (
    <AppShell>
      <PageContainer variant="wide">
        {/* Page Header with Editorial Serif Title */}
        <PageHeader
          title="Mata Kuliah"
          editorial
          description="Daftar mata kuliah aktif dan jadwal perkuliahan semester ini."
          metadata={`${courses.length} mata kuliah · ${totalCredits} SKS`}
          action={
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-2 rounded-md shadow-xs transition-colors select-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Mata Kuliah</span>
            </button>
          }
        />

        {/* Structured List / Responsive Row View */}
        {courses.length === 0 && !isLoading ? (
          <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-8 space-y-3 bg-surface-1/50">
            <p className="text-foreground font-editorial italic text-base">Belum ada mata kuliah terdaftar.</p>
            <p className="max-w-sm mx-auto text-muted-foreground">
              Tambahkan mata kuliah semester ini untuk mengelompokkan tugas, jadwal, catatan, dan bahan bacaan.
            </p>
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-2 rounded-md shadow-xs transition-colors mt-2"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Mata Kuliah Pertama</span>
            </button>
          </div>
        ) : (
          <div className="border border-border-default rounded-lg overflow-hidden bg-surface-1 divide-y divide-border-subtle shadow-xs">
            {/* Desktop Table Header */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 text-[11px] font-mono text-muted-foreground uppercase tracking-widest bg-surface-2/60 border-b border-border-default select-none">
              <div className="col-span-5">Mata Kuliah & Kode</div>
              <div className="col-span-4">Jadwal & Ruang</div>
              <div className="col-span-2">Dosen Pengampu</div>
              <div className="col-span-1 text-right">SKS</div>
            </div>

            {/* Course Rows */}
            {courses.map((course) => {
              const schedules = course.schedules || [];
              const isMenuOpen = activeMenuId === course.id;

              return (
                <div
                  key={course.id}
                  onClick={() => router.push(`/mata-kuliah/${course.id}`)}
                  className="p-3.5 sm:px-4 sm:py-3 text-xs hover:bg-surface-2 cursor-pointer transition-colors group relative"
                >
                  {/* Desktop Layout */}
                  <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
                    {/* Course Name & Code */}
                    <div className="col-span-5 min-w-0 pr-2">
                      <div className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">
                        {course.name}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        {course.code || "Tanpa Kode"}
                      </div>
                    </div>

                    {/* Schedules & Room */}
                    <div className="col-span-4 text-muted-foreground">
                      {schedules.length > 0 ? (
                        <div className="space-y-0.5 font-mono text-[11px]">
                          {schedules.map((s: any) => (
                            <div key={s.id} className="truncate">
                              {INDONESIAN_DAYS[s.dayOfWeek]} {s.startTime}–{s.endTime}
                              {s.room ? ` · Ruang ${s.room}` : ""}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </div>

                    {/* Lecturer */}
                    <div className="col-span-2 text-muted-foreground truncate text-[11px]">
                      {course.lecturer || "—"}
                    </div>

                    {/* Credits & Hover Action Buttons */}
                    <div className="col-span-1 text-right flex items-center justify-end gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground group-hover:opacity-0 transition-opacity">
                        {course.credits || 2} SKS
                      </span>

                      {/* Secondary Actions on Hover for Desktop */}
                      <div className="absolute right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => handleEdit(course, e)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
                          title="Edit Mata Kuliah"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(course.id, e)}
                          className="p-1 rounded text-muted-foreground hover:text-status-danger hover:bg-status-danger-subtle transition-colors"
                          title="Hapus Mata Kuliah"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Stacked Layout */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground text-sm leading-tight">
                          {course.name}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          {course.code || "Tanpa Kode"} · {course.credits || 2} SKS
                        </div>
                      </div>

                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(isMenuOpen ? null : course.id);
                          }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Menu Aksi"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {isMenuOpen && (
                          <div
                            className="absolute right-0 top-8 z-30 w-32 bg-surface-1 border border-border-default rounded-md shadow-lg py-1 text-xs animate-fade-in"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={(e) => handleEdit(course, e)}
                              className="w-full px-3 py-2 text-left text-foreground hover:bg-secondary flex items-center gap-2"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={(e) => handleDelete(course.id, e)}
                              className="w-full px-3 py-2 text-left text-status-danger hover:bg-status-danger-subtle flex items-center gap-2"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 text-[11px] text-muted-foreground pt-1 border-t border-border-subtle">
                      {schedules.length > 0 && (
                        <div className="font-mono text-foreground/80">
                          {schedules.map((s: any) => (
                            <div key={s.id}>
                              {INDONESIAN_DAYS[s.dayOfWeek]}, {s.startTime}–{s.endTime}
                              {s.room ? ` · Ruang ${s.room}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                      {course.lecturer && (
                        <div className="truncate">
                          Dosen: {course.lecturer}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <CourseFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          courseToEdit={selectedCourse}
          onSaved={fetchCourses}
        />
      </PageContainer>
    </AppShell>
  );
}
