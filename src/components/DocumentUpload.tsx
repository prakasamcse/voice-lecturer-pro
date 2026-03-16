import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileText, Loader2, Volume2, VolumeX, X, Presentation } from "lucide-react";
import { toast } from "sonner";
import type { LectureSection } from "@/hooks/useLecturePlayer";

const EXTRACT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-document-text`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md,.csv,.pptx,.ppt";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const TTS_CHUNK_SIZE = 1500; // characters per TTS chunk to avoid timeout

function splitTextIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('. ', maxLen - 1);
    if (splitAt === -1) splitAt = remaining.lastIndexOf(' ', maxLen - 1);
    if (splitAt === -1) splitAt = maxLen;
    else splitAt += 1;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  return chunks.filter(c => c.length > 0);
}

interface DocumentUploadProps {
  onPptSessionStart?: (sections: LectureSection[], title: string) => void;
}

const DocumentUpload = ({ onPptSessionStart }: DocumentUploadProps) => {
  const [extractedText, setExtractedText] = useState("");
  const [pptSections, setPptSections] = useState<LectureSection[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakProgress, setSpeakProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);

  const isPpt = fileName.toLowerCase().endsWith(".pptx") || fileName.toLowerCase().endsWith(".ppt");

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 20MB.");
      return;
    }

    setIsExtracting(true);
    setFileName(file.name);
    setExtractedText("");
    setPptSections(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(EXTRACT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Extraction failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const data = await resp.json();
      setExtractedText(data.text);
      if (data.sections) {
        setPptSections(data.sections);
      }
      toast.success(data.sections ? "Slides extracted! Start a voice session." : "Text extracted! Click play to listen.");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to extract text");
      setFileName("");
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handlePlayStop = async () => {
    if (isSpeaking) {
      abortRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsSpeaking(false);
      setSpeakProgress("");
      return;
    }
    if (!extractedText) return;

    abortRef.current = false;
    setIsSpeaking(true);

    try {
      const cleanText = extractedText
        .replace(/[#*_~`>\[\]()!]/g, "")
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, " ")
        .trim();

      const chunks = splitTextIntoChunks(cleanText, TTS_CHUNK_SIZE);

      for (let i = 0; i < chunks.length; i++) {
        if (abortRef.current) break;
        setSpeakProgress(`Playing ${i + 1}/${chunks.length}`);

        const resp = await fetch(TTS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: chunks[i], targetLanguage: "en-IN", speaker: "anushka" }),
        });

        if (!resp.ok) throw new Error("TTS failed");
        if (abortRef.current) break;

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Audio playback failed")); };
          audio.play().catch(reject);
        });
      }
    } catch (e: any) {
      if (!abortRef.current) {
        toast.error(e.message || "TTS failed");
      }
    } finally {
      setIsSpeaking(false);
      setSpeakProgress("");
      audioRef.current = null;
    }
  };

  const handleStartPptSession = () => {
    if (pptSections && onPptSessionStart) {
      const title = fileName.replace(/\.(pptx?|ppt)$/i, "");
      onPptSessionStart(pptSections, title);
    }
  };

  const handleClear = () => {
    stopSpeaking();
    setExtractedText("");
    setPptSections(null);
    setFileName("");
  };

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Document to Speech</h2>
          </div>
          {fileName && (
            <Button variant="ghost" size="icon" onClick={handleClear} className="h-7 w-7">
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {!fileName ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50 hover:bg-accent/30"
          >
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Drop a document or click to upload</p>
              <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, PPTX, TXT, MD — up to 20MB</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleInputChange}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {isPpt ? <Presentation className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
              <span className="text-sm font-medium text-foreground truncate">{fileName}</span>
              {isExtracting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {extractedText && (
              <>
                <ScrollArea className="h-[150px] rounded-md border border-border p-3">
                  <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {extractedText.slice(0, 2000)}{extractedText.length > 2000 ? "…" : ""}
                  </p>
                </ScrollArea>

                <div className="flex items-center gap-2">
                  {isPpt && pptSections && onPptSessionStart ? (
                    <Button onClick={handleStartPptSession} className="gap-2">
                      <Presentation className="h-4 w-4" />
                      Start Voice Session ({pptSections.length} slides)
                    </Button>
                  ) : null}
                  <Button onClick={handlePlayStop} variant={isPpt ? "outline" : "default"} className="gap-2">
                    {isSpeaking ? (
                      <>
                        <VolumeX className="h-4 w-4" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-4 w-4" />
                        Read Aloud
                      </>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {extractedText.length.toLocaleString()} characters
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default DocumentUpload;
