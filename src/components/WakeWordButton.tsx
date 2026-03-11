import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, Radio, CircleOff } from "lucide-react";
import { toast } from "sonner";
import { useWakeWord } from "@/hooks/useWakeWord";
import { useVoiceOutput } from "@/hooks/useVoiceChat";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-qa`;

interface WakeWordButtonProps {
  topic: string;
}

const WakeWordButton = ({ topic }: WakeWordButtonProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const { isSpeaking, speak, stopSpeaking } = useVoiceOutput();

  const handleQuestion = useCallback(async (question: string) => {
    setIsProcessing(true);
    setLastQuestion(question);

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
          } catch { /* partial chunk */ }
        }
      }

      setIsProcessing(false);
      if (fullText) await speak(fullText);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to get answer");
      setIsProcessing(false);
    }
  }, [topic, speak]);

  const { isActive, detected, activate, deactivate } = useWakeWord(handleQuestion);

  const handleClick = () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    if (isActive) {
      deactivate();
    } else {
      try {
        activate();
        toast.success('Say "Hey JD" followed by your question');
      } catch (e: any) {
        toast.error(e.message || "Speech recognition not supported");
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isActive ? (detected || isProcessing ? "secondary" : "default") : "outline"}
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
            <Volume2 className="h-4 w-4 animate-pulse" />
            Speaking…
          </>
        ) : detected ? (
          <>
            <Radio className="h-4 w-4 animate-pulse" />
            Listening…
          </>
        ) : isActive ? (
          <>
            <CircleOff className="h-4 w-4" />
            Hey JD Active
          </>
        ) : (
          <>
            <Radio className="h-4 w-4" />
            Hey JD
          </>
        )}
      </Button>
      {lastQuestion && !detected && !isProcessing && (
        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
          "{lastQuestion}"
        </span>
      )}
    </div>
  );
};

export default WakeWordButton;
