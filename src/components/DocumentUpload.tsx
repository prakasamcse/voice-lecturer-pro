import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileText, Loader2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { useVoiceOutput } from "@/hooks/useVoiceChat";

const EXTRACT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-document-text`;
const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md,.csv";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const DocumentUpload = () => {
  const [extractedText, setExtractedText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isSpeaking, speak, stopSpeaking } = useVoiceOutput();

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 10MB.");
      return;
    }

    setIsExtracting(true);
    setFileName(file.name);
    setExtractedText("");

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

      const { text } = await resp.json();
      setExtractedText(text);
      toast.success("Text extracted! Click play to listen.");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to extract text");
      setFileName("");
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  };

  const handlePlayStop = async () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    if (!extractedText) return;

    try {
      await speak(extractedText);
    } catch (e: any) {
      toast.error(e.message || "TTS failed");
    }
  };

  const handleClear = () => {
    stopSpeaking();
    setExtractedText("");
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
              <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT, MD — up to 10MB</p>
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
              <FileText className="h-4 w-4 text-primary" />
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
                  <Button onClick={handlePlayStop} className="gap-2">
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
