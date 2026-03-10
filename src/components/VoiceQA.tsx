import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useVoiceInput, useVoiceOutput } from "@/hooks/useVoiceChat";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-qa`;

interface VoiceQAProps {
  topic: string;
}

const VoiceQA = ({ topic }: VoiceQAProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const { isListening, startListening, stopListening } = useVoiceInput();
  const { isSpeaking, speak, stopSpeaking } = useVoiceOutput();
  const abortRef = useRef<AbortController | null>(null);

  const askAndAnswer = useCallback(async (question: string) => {
    setIsProcessing(true);
    setLastTranscript(question);

    const controller = new AbortController();
    abortRef.current = controller;

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
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      // Parse SSE stream
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
          } catch { /* partial chunk */ }
        }
      }

      setIsProcessing(false);

      if (fullText) {
        await speak(fullText);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error(e);
        toast.error(e.message || "Failed to get answer");
      }
      setIsProcessing(false);
    }
  }, [topic, speak]);

  const handleMicClick = () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    if (isListening) {
      stopListening();
      return;
    }
    if (isProcessing) return;

    try {
      startListening((transcript) => {
        askAndAnswer(transcript);
      });
    } catch (e: any) {
      toast.error(e.message || "Speech recognition not supported");
    }
  };

  const isActive = isListening || isProcessing || isSpeaking;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isListening ? "destructive" : isSpeaking ? "secondary" : "outline"}
        className="gap-2"
        onClick={handleMicClick}
      >
        {isListening ? (
          <>
            <MicOff className="h-4 w-4" />
            Listening…
          </>
        ) : isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking…
          </>
        ) : isSpeaking ? (
          <>
            <VolumeX className="h-4 w-4" />
            Stop
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            Ask by Voice
          </>
        )}
      </Button>
      {lastTranscript && !isListening && (
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          "{lastTranscript}"
        </span>
      )}
    </div>
  );
};

export default VoiceQA;
