"use client";

import React, { useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  Bold,
  Italic,
  Heading2,
  List,
  Quote,
  Eye,
  Edit3,
  Loader2,
} from "lucide-react";

export function MarkdownEditor({
  content,
  onChange,
  onAiSummarize,
  isSummarizing,
}: {
  content: string;
  onChange: (val: string) => void;
  onAiSummarize?: () => void;
  isSummarizing?: boolean;
}) {
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  const insertText = (before: string, after: string = "") => {
    onChange(`${content}${before}${after}`);
  };

  const getSanitizedHtml = (markdownText: string) => {
    const rawHtml = marked.parse(markdownText || "*Belum ada konten catatan.*") as string;
    return typeof window !== "undefined" ? DOMPurify.sanitize(rawHtml) : rawHtml;
  };

  return (
    <div className="rounded-lg border border-border-default bg-surface-1 overflow-hidden flex flex-col space-y-0 shadow-xs">
      {/* Formatting Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-border-default bg-surface-2 flex-wrap gap-1">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => insertText("**", "**")}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
            title="Tebal (Bold)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText("*", "*")}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
            title="Miring (Italic)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText("\n## ")}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText("\n- ")}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
            title="Daftar (List)"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertText("\n> ")}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
            title="Kutipan / Asas Hukum"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onAiSummarize && (
            <button
              type="button"
              onClick={onAiSummarize}
              disabled={isSummarizing || !content.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-secondary text-foreground hover:bg-surface-3 border border-border-default transition-colors disabled:opacity-50"
            >
              {isSummarizing && <Loader2 className="h-3 w-3 animate-spin" />}
              <span>AI Ringkas</span>
            </button>
          )}

          <div className="inline-flex h-7 items-center rounded-md bg-secondary p-0.5 text-xs text-muted-foreground border border-border-default">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                viewMode === "edit" ? "bg-surface-1 text-foreground font-semibold shadow-xs" : "hover:text-foreground"
              }`}
              title="Editor"
            >
              <Edit3 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                viewMode === "preview" ? "bg-surface-1 text-foreground font-semibold shadow-xs" : "hover:text-foreground"
              }`}
              title="Preview"
            >
              <Eye className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Editor Body with optimal 65-75ch readability */}
      <div className="p-4 sm:p-5">
        {viewMode === "edit" ? (
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Tulis catatan kuliah di sini (Mendukung Markdown, rumusan pasal, dan doktrin hukum)..."
            rows={14}
            className="w-full font-mono text-xs border-0 bg-transparent p-0 focus:outline-none text-foreground placeholder:text-muted-foreground resize-none leading-relaxed"
          />
        ) : (
          <div
            className="prose prose-neutral dark:prose-invert max-w-none min-h-[250px] text-xs leading-relaxed"
            dangerouslySetInnerHTML={{ __html: getSanitizedHtml(content) }}
          />
        )}
      </div>
    </div>
  );
}
