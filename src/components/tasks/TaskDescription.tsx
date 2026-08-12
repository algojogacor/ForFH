import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface TaskDescriptionProps {
  description: string;
  clampLines?: 1 | 2;
  expandable?: boolean;
  className?: string;
}

// Teks instruksi tugas — sudah plaintext dari descriptionToText, dirender
// sebagai teks React biasa (auto-escape, tanpa dangerouslySetInnerHTML).
// whitespace-pre-line WAJIB: helper menghasilkan "\n" sebagai pemisah
// paragraf, tanpa properti itu JSX merapikan (menggabung) baris-barisnya.
export function TaskDescription({
  description,
  clampLines,
  expandable,
  className,
}: TaskDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const text = (description || "").trim();
  if (!text) return null; // deskripsi kosong -> tidak ada blok

  const clamped = !!clampLines && !expanded;
  // Kelas line-clamp ditulis literal agar Tailwind JIT ikut membangunkannya
  const clampClass = clampLines === 1 ? "line-clamp-1" : clampLines === 2 ? "line-clamp-2" : "";
  const hasToggle = expandable && text.length > 140;

  return (
    <div className={className}>
      <p
        className={`text-muted-foreground whitespace-pre-line leading-relaxed ${
          clamped ? clampClass : ""
        }`}
      >
        {text}
      </p>
      {hasToggle && (
        <button
          type="button"
          // CRITICAL: tombol berada di dalam baris /tugas yang onClick-nya
          // membuka modal edit — tanpa stopPropagation klik akan membubble ke
          // handler baris dan membuka modal (kelas bug yang diperbaiki di
          // 4336c24). stopPropagation wajib di sini.
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline font-medium select-none"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              tutup
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              baca instruksi
            </>
          )}
        </button>
      )}
    </div>
  );
}
