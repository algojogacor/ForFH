"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, Loader2, File } from "lucide-react";
import { Progress } from "../ui/Progress";
import { useToast } from "../ui/Toast";
import { FILE_CATEGORIES } from "@/lib/constants";

export function FileUploadZone({
  courses = [],
  onFileUploaded,
}: {
  courses?: any[];
  onFileUploaded: () => void;
}) {
  const { toast, success } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState("assignment");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(15);

    try {
      // 1. Request Resumable Upload Session from our backend
      const initRes = await fetch("/api/files/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          category: selectedCategory,
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok || initData.error) {
        throw new Error(initData.error || "Gagal membuat sesi upload.");
      }

      setUploadProgress(40);

      // 2. Direct upload bytes to Google Drive resumable session URL
      if (initData.uploadUrl.startsWith("http")) {
        const uploadRes = await fetch(initData.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Gagal mengunggah file ke Google Drive.");
        }

        const driveResult = await uploadRes.json().catch(() => ({}));
        const driveFileId = driveResult.id || `drive_${Date.now()}`;

        setUploadProgress(80);

        // 3. Record metadata in database
        await fetch("/api/files/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driveFileId,
            driveParentFolderId: initData.folderId || null,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            category: selectedCategory,
            courseId: selectedCourseId || null,
          }),
        });
      } else {
        // Dev fallback
        await fetch("/api/files/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driveFileId: `mock_${Date.now()}`,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            category: selectedCategory,
            courseId: selectedCourseId || null,
          }),
        });
      }

      setUploadProgress(100);
      success(`File "${file.name}" berhasil diunggah.`);
      onFileUploaded();
    } catch (err: any) {
      toast(err.message || "Gagal mengunggah file.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 rounded-lg border border-dashed border-border-default bg-surface-1 text-center space-y-3 text-xs">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="max-w-md mx-auto space-y-2.5">
        <div className="h-10 w-10 rounded bg-secondary text-foreground flex items-center justify-center mx-auto">
          <UploadCloud className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">
            Unggah Berkas Akademik
          </p>
          <p className="text-muted-foreground text-[11px]">
            PDF, DOCX, PPTX, buku teks, dan jurnal rujukan.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
          >
            {FILE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="h-8 bg-surface-1 border border-border-default rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">-- Tanpa Mata Kuliah --</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {isUploading ? (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Mengunggah...
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shadow-xs"
          >
            <File className="h-3.5 w-3.5" />
            <span>Pilih Berkas Komputer</span>
          </button>
        )}
      </div>
    </div>
  );
}
