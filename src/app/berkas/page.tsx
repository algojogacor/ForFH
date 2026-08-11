"use client";

import React, { useState, useEffect } from "react";
import { File, Download, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer, PageHeader } from "@/components/ui/PageContainer";
import { Card, CardContent } from "@/components/ui/Card";
import { QuotaProgressBar } from "@/components/files/QuotaProgressBar";
import { FileUploadZone } from "@/components/files/FileUploadZone";
import { useToast } from "@/components/ui/Toast";
import { formatDateIndonesian } from "@/lib/utils";

export default function FilesPage() {
  const { toast, success } = useToast();
  const [files, setFiles] = useState<any[]>([]);
  const [quota, setQuota] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [filesRes, quotaRes, coursesRes] = await Promise.all([
        fetch("/api/files").then((r) => r.json()),
        fetch("/api/files/quota").then((r) => r.json()),
        fetch("/api/courses").then((r) => r.json()),
      ]);
      setFiles(filesRes.files || []);
      setQuota(quotaRes.quota || null);
      setCourses(coursesRes.courses || []);
    } catch (err) {
      console.error("Failed to load files:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Hapus berkas ini dari vault?")) return;
    try {
      await fetch(`/api/files?id=${fileId}`, { method: "DELETE" });
      success("Berkas berhasil dihapus.");
      fetchData();
    } catch (err) {
      toast("Gagal menghapus berkas.");
    }
  };

  const filteredFiles = files.filter((f) => {
    if (selectedCategory !== "ALL" && f.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  return (
    <AppShell>
      <PageContainer variant="wide">
        <PageHeader
          title="Vault Berkas"
          description="Penyimpanan silabus, draf tugas, jurnal ilmiah, dan dokumen akademik terenkripsi."
          metadata={`${files.length} berkas tersimpan`}
        />

        {/* Quota Progress Bar */}
        <QuotaProgressBar quota={quota} />

        {/* File Upload Zone */}
        <FileUploadZone courses={courses} onFileUploaded={fetchData} />

        {/* Category Filter & Files List */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              Daftar Berkas ({filteredFiles.length})
            </h3>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="assignment">Tugas</option>
              <option value="reading">Bahan Bacaan</option>
              <option value="syllabus">Silabus</option>
              <option value="exam">Ujian</option>
              <option value="general">Umum</option>
            </select>
          </div>

          {filteredFiles.length === 0 && !isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border-default rounded-lg p-6">
              Belum ada berkas dalam kategori ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredFiles.map((file) => (
                <Card key={file.id} className="border-border-default hover:bg-surface-2 transition-colors">
                  <CardContent className="p-3.5 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <div className="h-8 w-8 rounded bg-secondary text-foreground flex items-center justify-center shrink-0">
                          <File className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB • {file.category}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-1 rounded text-muted-foreground hover:text-status-danger hover:bg-status-danger-subtle transition-colors"
                        title="Hapus Berkas"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1.5 border-t border-border-subtle">
                      <span>{formatDateIndonesian(file.createdAt, false)}</span>
                      {file.driveWebViewLink ? (
                        <a
                          href={file.driveWebViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                        >
                          <Download className="h-3 w-3" />
                          <span>Unduh</span>
                        </a>
                      ) : (
                        <span className="text-status-success font-medium">Drive</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}
