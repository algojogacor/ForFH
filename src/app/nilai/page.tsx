"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { GradeCalculator } from "@/components/grades/GradeCalculator";
import { useToast } from "@/components/ui/Toast";

export default function GradesPage() {
  const { toast, success } = useToast();
  const [gradesData, setGradesData] = useState<any>(null);

  const fetchGrades = async () => {
    try {
      const res = await fetch("/api/grades");
      const data = await res.json();
      setGradesData(data);
    } catch (err) {
      console.error("Failed to load grades:", err);
    }
  };

  useEffect(() => {
    fetchGrades();
  }, []);

  const handleAddComponent = async (
    courseId: string,
    componentName: string,
    weight: number,
    score: number
  ) => {
    try {
      await fetch("/api/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, componentName, weight, score }),
      });
      success("Komponen nilai berhasil ditambahkan.");
      fetchGrades();
    } catch (err) {
      toast("Gagal menambahkan komponen nilai.");
    }
  };

  const handleDeleteComponent = async (gradeId: string) => {
    try {
      await fetch(`/api/grades?id=${gradeId}`, { method: "DELETE" });
      success("Komponen nilai dihapus.");
      fetchGrades();
    } catch (err) {
      toast("Gagal menghapus komponen.");
    }
  };

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Kalkulator Nilai & IPK"
          description="Simulasi Indeks Prestasi Kumulatif dan rincian bobot nilai per mata kuliah."
          metadata={gradesData ? `IPK: ${(gradesData.gpa || 0).toFixed(2)}` : ""}
        />

        {gradesData && (
          <GradeCalculator
            gpa={gradesData.gpa || 0}
            totalCredits={gradesData.totalCredits || 0}
            courseSummaries={gradesData.courseSummaries || []}
            onAddGradeComponent={handleAddComponent}
            onDeleteGradeComponent={handleDeleteComponent}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}
