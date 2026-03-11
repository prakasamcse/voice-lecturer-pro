import { useState } from "react";
import { useNavigate } from "react-router-dom";
import VoiceQA from "@/components/VoiceQA";
import DocumentUpload from "@/components/DocumentUpload";
import SlidePresenter from "@/components/SlidePresenter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLecturePlayer, type PlayerState } from "@/hooks/useLecturePlayer";
import { Play, Pause, RotateCcw, Square, BookOpen, Mic, Loader2, Download, MessageCircle, Presentation } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadAsText, downloadAsMarkdown, downloadAsPdf } from "@/lib/downloadLecture";
import { downloadAsPpt } from "@/lib/downloadPpt";

const stateLabels: Record<PlayerState, string> = {
  idle: "Ready",
  generating: "Generating lecture content…",
  converting: "Converting to speech…",
  playing: "Playing lecture",
  paused: "Paused",
  complete: "Lecture complete",
};

const Index = () => {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState("10");
  const [showPresenter, setShowPresenter] = useState(false);
  const navigate = useNavigate();
  const player = useLecturePlayer();

  const canStart = topic.trim().length > 0 && player.state === "idle";
  const isActive = !["idle"].includes(player.state);
  const isWorking = ["generating", "converting"].includes(player.state);

  const handleStart = () => {
    if (canStart) player.startSession(topic.trim(), parseInt(duration));
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-accent/30 to-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Mic className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">AI Voice Teacher</h1>
            <p className="text-sm text-muted-foreground">Learn any topic through spoken lectures</p>
          </div>
          
          <VoiceQA topic={topic.trim()} />
          <Button variant="outline" className="gap-2" onClick={() => navigate(`/chat${topic.trim() ? `?topic=${encodeURIComponent(topic.trim())}` : ""}`)}>
            <MessageCircle className="h-4 w-4" />
            Ask Questions
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
        {/* Input Section */}
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Topic</label>
              <Input
                placeholder="e.g. Introduction to Artificial Intelligence"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isActive}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">Duration</label>
                <Select value={duration} onValueChange={setDuration} disabled={isActive}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="10">10 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="20">20 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleStart} disabled={!canStart} className="gap-2">
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Session
              </Button>

              {isActive && (
                <Button variant="outline" onClick={player.stop} className="gap-2">
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Document Upload */}
        <DocumentUpload />

        {/* Player Section */}
        {isActive && (
          <Card className="p-6">
            <div className="flex flex-col gap-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {stateLabels[player.state]}
                </span>
                {player.sections.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    Section {player.currentSectionIndex + 1} of {player.sections.length}
                  </span>
                )}
              </div>

              {/* Progress */}
              <Progress value={player.progress} className="h-2" />

              {/* Controls */}
              <div className="flex items-center gap-2">
                {player.state === "playing" && (
                  <Button variant="outline" size="icon" onClick={player.pause}>
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                {player.state === "paused" && (
                  <Button variant="outline" size="icon" onClick={player.resume}>
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                {(player.state === "playing" || player.state === "paused" || player.state === "complete") && (
                  <Button variant="outline" size="icon" onClick={player.restart}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Transcript */}
        {player.sections.length > 0 && (
          <Card className="flex-1 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Lecture Transcript</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowPresenter(true)}>
                  <Presentation className="h-4 w-4" />
                  Present
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => downloadAsText(player.sections, topic)}>
                      Plain Text (.txt)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => downloadAsMarkdown(player.sections, topic)}>
                      Markdown (.md)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => downloadAsPdf(player.sections, topic)}>
                      PDF (.pdf)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => downloadAsPpt(player.sections, topic)}>
                      PowerPoint (.pptx)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="flex flex-col gap-6 pr-4">
                {player.sections.map((section, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-4 transition-colors ${
                      i === player.currentSectionIndex && player.state !== "idle"
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <h3 className="mb-2 text-sm font-semibold text-foreground">{section.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{section.content}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Index;
