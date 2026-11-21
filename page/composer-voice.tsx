import { Button } from "@jaetask/toolkit/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@jaetask/toolkit/ui/tooltip";
import { type ReactNode, useEffect } from "react";
import { MicIcon, StopIcon, WaveIcon } from "./icons";
import {
  endCall,
  startCall,
  startRecording,
  stopRecording,
  stopSpeaking,
  type VoiceState,
} from "./voice";

const STATE: Record<VoiceState, string> = {
  idle: "",
  recording: "Listening… let go to send",
  busy: "Thinking…",
  listening: "On a call · listening",
  hearing: "On a call · hearing you…",
  thinking: "On a call · thinking…",
  speaking: "Speaking · Esc to stop",
};

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (/^(SELECT|INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable);

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ComposerVoice({ state, onCall }: { state: VoiceState; onCall: boolean }) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !typing(e.target)) {
        e.preventDefault();
        void startRecording();
      }
      if (e.key === "Escape") stopSpeaking();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target)) {
        e.preventDefault();
        stopRecording();
      }
    };
    const release = () => stopRecording();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointerup", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointerup", release);
    };
  }, []);

  const recording = state === "recording";
  const speaking = state === "speaking" || state === "busy";
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <span className="sr-only" aria-live="polite">
          {STATE[state]}
        </span>
        {state !== "idle" && (
          <span className="hidden pr-1 text-xs text-muted-foreground sm:inline">
            {STATE[state]}
          </span>
        )}
        {speaking && !onCall ? (
          <Tip label="Stop talking (Esc)">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 rounded-full"
              aria-label="Stop talking"
              onClick={() => stopSpeaking()}
            >
              <StopIcon />
            </Button>
          </Tip>
        ) : (
          <Tip label="Hold to talk (or hold Space)">
            <Button
              type="button"
              size="icon"
              variant={recording ? "destructive" : "ghost"}
              disabled={onCall}
              className="size-8 rounded-full"
              aria-label={recording ? "Listening, let go to send" : "Hold to talk"}
              aria-pressed={recording}
              onPointerDown={(e) => {
                e.preventDefault();
                void startRecording();
              }}
            >
              <MicIcon />
            </Button>
          </Tip>
        )}
        <Tip label={onCall ? "End the voice call" : "Start a hands-free voice call"}>
          <Button
            type="button"
            size="icon"
            variant={onCall ? "destructive" : "default"}
            aria-pressed={onCall}
            className={`size-8 rounded-full ${onCall ? "animate-pulse" : ""}`}
            aria-label={onCall ? "End the voice call" : "Start a voice call"}
            onClick={() => (onCall ? endCall() : void startCall())}
          >
            <WaveIcon />
          </Button>
        </Tip>
      </div>
    </TooltipProvider>
  );
}
