import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useVoiceOutput } from "@/hooks/useVoiceChat";
import {
  Play,
  Pause,
  X,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
} from "lucide-react";

type Section = { title: string; content: string };

interface SlidePresenterProps {
  sections: Section[];
  topic: string;
  onClose: () => void;
}

const SlidePresenter = ({ sections, topic, onClose }: SlidePresenterProps) => {
  const [currentSlide, setCurrentSlide] = useState(-1); // -1 = title slide
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const { isSpeaking, speak, stopSpeaking } = useVoiceOutput();
  const abortRef = useRef<AbortController | null>(null);
  const autoPlayRef = useRef(false);

  const totalSlides = sections.length + 1; // +1 for title
  const slideIndex = currentSlide + 1; // 0-based display index

  const speakSlide = useCallback(
    async (idx: number) => {
      if (!voiceEnabled) return;
      stopSpeaking();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const text =
        idx === -1
          ? `Welcome to the lecture on ${topic}`
          : `${sections[idx].title}. ${sections[idx].content}`;

      try {
        await speak(text, controller.signal);
      } catch {
        // aborted or failed
      }
    },
    [voiceEnabled, topic, sections, speak, stopSpeaking]
  );

  const goToSlide = useCallback(
    (idx: number) => {
      if (idx < -1 || idx >= sections.length) return;
      setCurrentSlide(idx);
    },
    [sections.length]
  );

  // Auto-play: speak current slide, then advance
  useEffect(() => {
    if (!isAutoPlaying) return;
    autoPlayRef.current = true;

    let cancelled = false;
    const run = async () => {
      if (!voiceEnabled) {
        // No voice: auto-advance every 5s
        await new Promise((r) => setTimeout(r, 5000));
        if (cancelled) return;
        if (currentSlide < sections.length - 1) {
          setCurrentSlide((p) => p + 1);
        } else {
          setIsAutoPlaying(false);
        }
        return;
      }

      await speakSlide(currentSlide);
      if (cancelled) return;

      // Small pause between slides
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled) return;

      if (currentSlide < sections.length - 1) {
        setCurrentSlide((p) => p + 1);
      } else {
        setIsAutoPlaying(false);
      }
    };
    run();

    return () => {
      cancelled = true;
      autoPlayRef.current = false;
    };
  }, [isAutoPlaying, currentSlide, sections.length, voiceEnabled, speakSlide]);

  const toggleAutoPlay = () => {
    if (isAutoPlaying) {
      setIsAutoPlaying(false);
      stopSpeaking();
      abortRef.current?.abort();
    } else {
      setIsAutoPlaying(true);
    }
  };

  const handleClose = () => {
    stopSpeaking();
    abortRef.current?.abort();
    setIsAutoPlaying(false);
    onClose();
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (!isAutoPlaying) goToSlide(currentSlide + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!isAutoPlaying) goToSlide(currentSlide - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentSlide, isAutoPlaying, goToSlide, handleClose]);

  const section = currentSlide >= 0 ? sections[currentSlide] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Slide area */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="relative w-full max-w-5xl aspect-[16/9] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
          {currentSlide === -1 ? (
            /* Title slide */
            <div className="flex h-full flex-col items-center justify-center bg-primary p-12 text-center">
              <h1 className="text-4xl font-bold text-primary-foreground md:text-5xl lg:text-6xl leading-tight">
                {topic}
              </h1>
              <p className="mt-6 text-lg text-primary-foreground/70">
                AI Voice Teacher
              </p>
            </div>
          ) : (
            /* Content slide */
            <div className="flex h-full flex-col p-8 md:p-12">
              <div className="mb-6 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {currentSlide + 1}
                </span>
                <h2 className="text-2xl font-bold text-foreground md:text-3xl">
                  {section?.title}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                  {section?.content}
                </p>
              </div>
              <div className="mt-4 text-right text-sm text-muted-foreground">
                {currentSlide + 1} / {sections.length}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls bar */}
      <div className="border-t border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToSlide(currentSlide - 1)}
              disabled={currentSlide <= -1 || isAutoPlaying}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[80px] text-center text-sm text-muted-foreground">
              {slideIndex + 1} / {totalSlides}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToSlide(currentSlide + 1)}
              disabled={currentSlide >= sections.length - 1 || isAutoPlaying}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setVoiceEnabled((v) => !v);
                if (isSpeaking) stopSpeaking();
              }}
              title={voiceEnabled ? "Mute narration" : "Enable narration"}
            >
              {voiceEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>

            <Button onClick={toggleAutoPlay} className="gap-2">
              {isAutoPlaying ? (
                <>
                  <Pause className="h-4 w-4" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Auto Present
                </>
              )}
            </Button>

            <Button variant="outline" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlidePresenter;
