import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

export type LectureSection = {
  title: string;
  content: string;
};

export type PlayerState = "idle" | "generating" | "converting" | "playing" | "paused" | "complete";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callFunction(name: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

export function useLecturePlayer() {
  const [state, setState] = useState<PlayerState>("idle");
  const [sections, setSections] = useState<LectureSection[]>([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobsRef = useRef<Map<number, string>>(new Map());
  const abortRef = useRef(false);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    audioBlobsRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioBlobsRef.current.clear();
  }, []);

  const fetchTTS = useCallback(async (text: string, previousText?: string, nextText?: string): Promise<string> => {
    const resp = await callFunction("elevenlabs-tts", { text, previousText, nextText });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "TTS failed" }));
      throw new Error(err.error || "TTS request failed");
    }
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }, []);

  const playSection = useCallback((index: number, allSections: LectureSection[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      const url = audioBlobsRef.current.get(index);
      if (!url) { reject(new Error("Audio not ready")); return; }

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        if (audio.duration) {
          const sectionProgress = (index + audio.currentTime / audio.duration) / allSections.length;
          setProgress(Math.min(sectionProgress * 100, 100));
        }
      };
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback error"));
      audio.play().catch(reject);
    });
  }, []);

  const startSession = useCallback(async (topic: string, durationMinutes: number) => {
    cleanup();
    abortRef.current = false;
    setState("generating");
    setSections([]);
    setCurrentSectionIndex(0);
    setProgress(0);

    try {
      // Generate lecture
      const resp = await callFunction("generate-lecture", { topic, durationMinutes });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Failed to generate lecture");
      }
      const data = await resp.json();
      const lectureSections: LectureSection[] = data.sections;
      setSections(lectureSections);

      if (abortRef.current) return;

      // Convert first section to speech
      setState("converting");
      const firstUrl = await fetchTTS(
        lectureSections[0].content,
        undefined,
        lectureSections[1]?.content?.slice(0, 200)
      );
      audioBlobsRef.current.set(0, firstUrl);

      if (abortRef.current) return;

      // Start playing
      setState("playing");

      for (let i = 0; i < lectureSections.length; i++) {
        if (abortRef.current) return;
        setCurrentSectionIndex(i);

        // Prefetch next section
        if (i + 1 < lectureSections.length && !audioBlobsRef.current.has(i + 1)) {
          fetchTTS(
            lectureSections[i + 1].content,
            lectureSections[i].content.slice(-200),
            lectureSections[i + 2]?.content?.slice(0, 200)
          ).then((url) => audioBlobsRef.current.set(i + 1, url))
            .catch((e) => console.error("Prefetch error:", e));
        }

        // Wait for audio to be ready if not yet fetched
        if (!audioBlobsRef.current.has(i)) {
          setState("converting");
          const url = await fetchTTS(
            lectureSections[i].content,
            lectureSections[i - 1]?.content?.slice(-200),
            lectureSections[i + 1]?.content?.slice(0, 200)
          );
          audioBlobsRef.current.set(i, url);
          if (abortRef.current) return;
          setState("playing");
        }

        await playSection(i, lectureSections);
      }

      setProgress(100);
      setState("complete");
    } catch (e) {
      if (!abortRef.current) {
        console.error("Lecture error:", e);
        toast.error(e instanceof Error ? e.message : "An error occurred");
        setState("idle");
      }
    }
  }, [cleanup, fetchTTS, playSection]);

  const pause = useCallback(() => {
    if (audioRef.current && state === "playing") {
      audioRef.current.pause();
      setState("paused");
    }
  }, [state]);

  const resume = useCallback(() => {
    if (audioRef.current && state === "paused") {
      audioRef.current.play();
      setState("playing");
    }
  }, [state]);

  const restart = useCallback(() => {
    if (sections.length > 0) {
      abortRef.current = true;
      cleanup();
      // Small delay to let abort propagate
      setTimeout(() => {
        abortRef.current = false;
        setCurrentSectionIndex(0);
        setProgress(0);
        setState("playing");

        // Replay from cached audio
        const replay = async () => {
          try {
            for (let i = 0; i < sections.length; i++) {
              if (abortRef.current) return;
              setCurrentSectionIndex(i);

              if (!audioBlobsRef.current.has(i)) {
                setState("converting");
                const url = await fetchTTS(
                  sections[i].content,
                  sections[i - 1]?.content?.slice(-200),
                  sections[i + 1]?.content?.slice(0, 200)
                );
                audioBlobsRef.current.set(i, url);
                setState("playing");
              }

              await playSection(i, sections);
            }
            setProgress(100);
            setState("complete");
          } catch (e) {
            if (!abortRef.current) {
              toast.error("Playback error");
              setState("idle");
            }
          }
        };
        replay();
      }, 100);
    }
  }, [sections, cleanup, fetchTTS, playSection]);

  const stop = useCallback(() => {
    abortRef.current = true;
    cleanup();
    setState("idle");
    setSections([]);
    setCurrentSectionIndex(0);
    setProgress(0);
  }, [cleanup]);

  const startFromSections = useCallback(async (preSections: LectureSection[]) => {
    cleanup();
    abortRef.current = false;
    setState("converting");
    setSections(preSections);
    setCurrentSectionIndex(0);
    setProgress(0);

    try {
      const firstUrl = await fetchTTS(
        preSections[0].content,
        undefined,
        preSections[1]?.content?.slice(0, 200)
      );
      audioBlobsRef.current.set(0, firstUrl);
      if (abortRef.current) return;
      setState("playing");

      for (let i = 0; i < preSections.length; i++) {
        if (abortRef.current) return;
        setCurrentSectionIndex(i);

        if (i + 1 < preSections.length && !audioBlobsRef.current.has(i + 1)) {
          fetchTTS(
            preSections[i + 1].content,
            preSections[i].content.slice(-200),
            preSections[i + 2]?.content?.slice(0, 200)
          ).then((url) => audioBlobsRef.current.set(i + 1, url))
            .catch((e) => console.error("Prefetch error:", e));
        }

        if (!audioBlobsRef.current.has(i)) {
          setState("converting");
          const url = await fetchTTS(
            preSections[i].content,
            preSections[i - 1]?.content?.slice(-200),
            preSections[i + 1]?.content?.slice(0, 200)
          );
          audioBlobsRef.current.set(i, url);
          if (abortRef.current) return;
          setState("playing");
        }

        await playSection(i, preSections);
      }

      setProgress(100);
      setState("complete");
    } catch (e) {
      if (!abortRef.current) {
        console.error("PPT session error:", e);
        toast.error(e instanceof Error ? e.message : "An error occurred");
        setState("idle");
      }
    }
  }, [cleanup, fetchTTS, playSection]);

  return {
    state,
    sections,
    currentSectionIndex,
    progress,
    startSession,
    startFromSections,
    pause,
    resume,
    restart,
    stop,
  };
}
