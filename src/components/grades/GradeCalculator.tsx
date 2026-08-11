"use client";

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";

export function GradeCalculator({
  gpa,
  totalCredits,
  courseSummaries = [],
  onAddGradeComponent,
  onDeleteGradeComponent,
}: {
  gpa: number;
  totalCredits: number;
  courseSummaries: any[];
  onAddGradeComponent: (courseId: string, compName: string, weight: number, score: number) => void;
  onDeleteGradeComponent: (gradeId: string) => void;
}) {
  const [selectedCourseId, setSelectedCourseId] = useState(courseSummaries[0]?.courseId || "");
  const [compName, setCompName] = useState("");
  const [weight, setWeight] = useState<number | "">(20);
  const [score, setScore] = useState<number | "">(85);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !compName.trim() || weight === "" || score === "") return;

    onAddGradeComponent(selectedCourseId, compName.trim(), Number(weight), Number(score));
    setCompName("");
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: GPA / IPK Stat */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="border-border-default bg-surface-1">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                Indeks Prestasi Kumulatif (IPK)
              </p>
              <div className="text-3xl font-bold font-mono text-foreground mt-1">
                {gpa.toFixed(2)}
                <span className="text-xs font-normal text-muted-foreground ml-1.5">
                  / 4.00
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border-default bg-surface-1">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                Total Beban SKS
              </p>
              <div className="text-3xl font-bold font-mono text-foreground mt-1">
                {totalCredits}
                <span className="text-xs font-normal text-muted-foreground ml-1.5">
                  SKS
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Grade Component Form */}
      <Card className="border-border-default">
        <CardHeader className="py-2.5 px-3.5 border-b border-border-default">
          <CardTitle className="text-xs font-semibold">
            Tambah Komponen Nilai (Tugas, UTS, UAS, Kehadiran)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5">
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-2"
              required
            >
              {courseSummaries.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.courseName} ({c.credits} SKS)
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="e.g. Tugas 1 / UTS"
              value={compName}
              onChange={(e) => setCompName(e.target.value)}
              required
              className="h-8 bg-surface-1 border border-border-default rounded-md px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <input
              type="number"
              placeholder="Bobot % (e.g. 30)"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              required
              className="h-8 bg-surface-1 border border-border-default rounded-md px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Skor (0-100)"
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
                required
                className="h-8 bg-surface-1 border border-border-default rounded-md px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full"
              />
              <button
                type="submit"
                className="px-3 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-colors shrink-0 shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Course Grade Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {courseSummaries.map((c) => (
          <Card key={c.courseId} className="border-border-default">
            <CardContent className="p-3.5 space-y-2.5 text-xs">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">{c.courseName}</h4>
                  <p className="text-[11px] font-mono text-muted-foreground">{c.credits} SKS</p>
                </div>
                <div className="text-right font-mono">
                  <span className="text-lg font-bold text-foreground">
                    {c.letterGrade}
                  </span>
                  {c.finalScore !== null && (
                    <p className="text-[11px] text-muted-foreground">
                      {c.finalScore} / 100
                    </p>
                  )}
                </div>
              </div>

              {/* Component Breakdown */}
              <div className="space-y-1 pt-2 border-t border-border-subtle">
                {c.components.length === 0 ? (
                  <p className="text-muted-foreground text-[11px]">Belum ada komponen nilai.</p>
                ) : (
                  c.components.map((comp: any) => (
                    <div
                      key={comp.id}
                      className="flex items-center justify-between text-xs p-2 rounded-md bg-secondary/50 border border-border-default font-mono"
                    >
                      <span className="text-foreground">
                        {comp.componentName} ({comp.weight}%)
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {comp.score}
                        </span>
                        <button
                          onClick={() => onDeleteGradeComponent(comp.id)}
                          className="text-muted-foreground hover:text-status-danger transition-colors p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
