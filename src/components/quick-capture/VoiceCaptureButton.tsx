"use client";

import React, { useState, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceCaptureButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export function VoiceCaptureButton({ onTranscript, className }: VoiceCaptureButtonProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        const recog = new SpeechRecognition();
        recog.continuous = false;
        recog.interimResults = false;
        recog.lang = "id-ID";

        recog.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          if (text) {
            onTranscript(text);
          }
          setIsListening(false);
        };

        recog.onerror = () => {
          setIsListening(false);
        };

        recog.onend = () => {
          setIsListening(false);
        };

        setRecognition(recog);
      }
    }
  }, [onTranscript]);

  if (!isSupported) return null;

  const toggleListening = () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
      } catch (err) {
        console.error("Speech recognition error:", err);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={cn(
        "h-10 w-10 rounded-xl flex items-center justify-center transition-all border shrink-0",
        isListening
          ? "bg-rose-500 text-white border-rose-400 animate-pulse shadow-lg shadow-rose-500/30"
          : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-muted hover:text-amber-300 hover:border-amber-500/40",
        className
      )}
      title={isListening ? "Mendengarkan... (klik untuk berhenti)" : "Ucapkan tugas (Voice to Text)"}
    >
      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
