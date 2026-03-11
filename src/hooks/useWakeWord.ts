import { useState, useRef, useCallback, useEffect } from "react";

const WAKE_PHRASES = ["hey jd", "hey j d", "hey jady", "hey jay dee", "a jd", "hey gd"];

function containsWakeWord(text: string): { found: boolean; question: string } {
  const lower = text.toLowerCase().trim();
  for (const phrase of WAKE_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      const question = text.slice(idx + phrase.length).trim();
      return { found: true, question };
    }
  }
  return { found: false, question: "" };
}

export function useWakeWord(onQuestion: (question: string) => void) {
  const [isActive, setIsActive] = useState(false);
  const [detected, setDetected] = useState(false);
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);

  const startRecognition = useCallback(() => {
    if (processingRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event: any) => {
      // Check all results and alternatives for wake word
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript;
          const { found, question } = containsWakeWord(transcript);

          if (found && result.isFinal) {
            setDetected(true);
            processingRef.current = true;

            // Stop current recognition
            recognition.stop();

            if (question.length > 2) {
              // Question was in the same utterance
              onQuestion(question);
              setTimeout(() => {
                setDetected(false);
                processingRef.current = false;
                if (activeRef.current) startRecognition();
              }, 1000);
            } else {
              // Listen for the follow-up question
              setTimeout(() => {
                listenForQuestion();
              }, 300);
            }
            return;
          }
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") {
        // Restart silently
        if (activeRef.current && !processingRef.current) {
          setTimeout(() => startRecognition(), 500);
        }
        return;
      }
      console.error("Wake word recognition error:", e.error);
    };

    recognition.onend = () => {
      if (activeRef.current && !processingRef.current) {
        setTimeout(() => startRecognition(), 300);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // already started
    }
  }, [onQuestion]);

  const listenForQuestion = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        onQuestion(transcript.trim());
      }
      setDetected(false);
      processingRef.current = false;
      if (activeRef.current) {
        setTimeout(() => startRecognition(), 1000);
      }
    };

    recognition.onerror = () => {
      setDetected(false);
      processingRef.current = false;
      if (activeRef.current) {
        setTimeout(() => startRecognition(), 500);
      }
    };

    recognition.onend = () => {
      if (processingRef.current) {
        setDetected(false);
        processingRef.current = false;
        if (activeRef.current) {
          setTimeout(() => startRecognition(), 500);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onQuestion, startRecognition]);

  const activate = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error("Speech recognition not supported");
    }
    activeRef.current = true;
    processingRef.current = false;
    setIsActive(true);
    setDetected(false);
    startRecognition();
  }, [startRecognition]);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    processingRef.current = false;
    setIsActive(false);
    setDetected(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  return { isActive, detected, activate, deactivate };
}
