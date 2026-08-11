"use client";

import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { ReadingCard } from "@/components/readings/ReadingCard";
import { ReadingFormModal } from "@/components/readings/ReadingFormModal";
import { useToast } from "@/components/ui/Toast";

export default function ReadingsPage() {
  const { toast, success } = useToast();
  const [readings, setReadings] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [readingsRes, coursesRes] = await Promise.all([
        fetch("/api/readings").then((r) => r.json()),
        fetch("/api/courses").then((r) => r.json()),
      ]);
      setReadings(readingsRes.readings || []);
      setCourses(coursesRes.courses || []);
    } catch (err) {
      console.error("Failed to load readings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateProgress = async (readingId: string, newPage: number) => {
    try {
      await fetch(`/api/readings/${readingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPage: newPage }),
      });
      fetchData();
    } catch (err) {
      toast("Gagal memperbarui progres bacaan.");
    }
  };

  const handleDelete = async (readingId: string) => {
    if (!confirm("Hapus bacaan ini?")) return;
    try {
      await fetch(`/api/readings/${readingId}`, { method: "DELETE" });
      success("Bahan bacaan berhasil dihapus.");
      fetchData();
    } catch (err) {
      toast("Gagal menghapus bacaan.");
    }
  };

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Bahan Bacaan & Literatur"
          description="Progres membaca buku teks, jurnal ilmiah, dan dokumen perkuliahan."
          metadata={`${readings.length} referensi tersimpan`}
          action={
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 rounded-md shadow-xs transition-colors select-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Bacaan</span>
            </button>
          }
        />

        {readings.length === 0 && !isLoading ? (
          <div className="py-16 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-6 space-y-2">
            <p className="text-foreground font-medium">Belum ada bahan bacaan.</p>
            <p className="text-muted-foreground">
              Tambahkan buku teks atau jurnal rujukan untuk memantau progres membaca Anda.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 rounded-md shadow-xs transition-colors mt-2"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Bacaan Pertama</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {readings.map((reading) => (
              <ReadingCard
                key={reading.id}
                reading={reading}
                onUpdateProgress={handleUpdateProgress}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        <ReadingFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          courses={courses}
          onSaved={fetchData}
        />
      </PageContainer>
    </AppShell>
  );
}
