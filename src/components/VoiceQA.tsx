import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useVoiceOutput } from "@/hooks/useVoiceChat";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-qa`;

const WAKE_PHRASES = ["hey jd", "hey j d", "hey jady", "hey jay dee", "a jd", "hey gd"];

function extractAfterWakeWord(text: string): { found: boolean; question: string } {
  const lower = text.toLowerCase().trim();
  for (const phrase of WAKE_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      return { found: true, question: text.slice(idx + phrase.length).trim() };
    }
  }
  return { found: false, question: "" };
}

interface VoiceQAProps {
  topic: string;
}

const VoiceQA = ({ topic }: VoiceQAProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [wakeDetected, setWakeDetected] = useState(false);
  const [isListeningPassive, setIsListeningPassive] = useState(false);
  const { isSpeaking, speak, stopSpeaking } = useVoiceOutput();
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);

  const askAndAnswer = useCallback(async (question: string) => {
    setIsProcessing(true);
    setLastTranscript(question);
    setWakeDetected(false);
    processingRef.current = true;

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: question }],
          topic,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullText += content;
          } catch { /* partial */ }
        }
      }

      setIsProcessing(false);
      processingRef.current = false;
      if (fullText) await speak(fullText);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error(e);
        toast.error(e.message || "Failed to get answer");
      }
      setIsProcessing(false);
      processingRef.current = false;
    }

    // Restart passive listening after answering
    if (activeRef.current) {
      setTimeout(() => startPassiveListening(), 1000);
    }
  }, [topic, speak]);

  // Listen for a follow-up question after wake word detected alone
  const listenForQuestion = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript?.trim();
      if (transcript) {
        askAndAnswer(transcript);
      } else {
        setWakeDetected(false);
        processingRef.current = false;
        if (activeRef.current) startPassiveListening();
      }
    };

    recognition.onerror = () => {
      setWakeDetected(false);
      processingRef.current = false;
      if (activeRef.current) setTimeout(() => startPassiveListening(), 500);
    };

    recognition.onend = () => {
      if (!processingRef.current) {
        setWakeDetected(false);
        if (activeRef.current) setTimeout(() => startPassiveListening(), 500);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [askAndAnswer]);

  // Passive always-on listening for wake word
  const startPassiveListening = useCallback(() => {
    if (processingRef.current || !activeRef.current) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript;
          const { found, question } = extractAfterWakeWord(transcript);

          if (found && result.isFinal) {
            setWakeDetected(true);
            processingRef.current = true;
            recognition.stop();

            if (question.length > 2) {
              askAndAnswer(question);
            } else {
              setTimeout(() => listenForQuestion(), 300);
            }
            return;
          }
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") {
        if (activeRef.current && !processingRef.current) {
          setTimeout(() => startPassiveListening(), 500);
        }
        return;
      }
    };

    recognition.onend = () => {
      if (activeRef.current && !processingRef.current) {
        setTimeout(() => startPassiveListening(), 300);
      }
    };

    recognitionRef.current = recognition;
    setIsListeningPassive(true);
    try { recognition.start(); } catch { /* already started */ }
  }, [askAndAnswer, listenForQuestion]);

  // Auto-start passive listening on mount
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    activeRef.current = true;
    startPassiveListening();

    return () => {
      activeRef.current = false;
      recognitionRef.current?.stop();
    };
  }, [startPassiveListening]);

  const handleClick = () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    if (isProcessing) return;

    // Toggle passive listening
    if (activeRef.current) {
      activeRef.current = false;
      recognitionRef.current?.stop();
      setIsListeningPassive(false);
    } else {
      activeRef.current = true;
      startPassiveListening();
      toast.success('Say "Hey JD" followed by your question');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={wakeDetected || isProcessing ? "secondary" : isListeningPassive ? "outline" : "ghost"}
        className="gap-2"
        onClick={handleClick}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking…
          </>
        ) : isSpeaking ? (
          <>
            <VolumeX className="h-4 w-4" />
            Stop
          </>
        ) : wakeDetected ? (
          <>
            <Mic className="h-4 w-4 animate-pulse" />
            Listening…
          </>
        ) : isListeningPassive ? (
          <>
            <Mic className="h-4 w-4 text-green-500" />
            Say "Hey JD"
          </>
        ) : (
          <>
            <MicOff className="h-4 w-4" />
            Mic Off
          </>
        )}
      </Button>
      {lastTranscript && !wakeDetected && !isProcessing && (
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          "{lastTranscript}"
        </span>
      )}
    </div>
  );
};

export default VoiceQA;
