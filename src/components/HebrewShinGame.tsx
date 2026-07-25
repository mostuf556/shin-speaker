import { useAppDispatch, useAppSelector } from "@/store";
import { useGameEngine } from "@/hooks/useGameEngine";
import { setLeadInMs, toggleAction, ActionType } from "@/store/slices/settings";
import { clearLog } from "@/store/slices/log";
import { clearAll, Sentence } from "@/store/slices/sentences";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

const ACTION_LABELS: Record<ActionType, string> = {
  playback: "השמעת הקלטה",
  "word-tts": "TTS מילה",
  "sentence-tts": "TTS משפט",
};

export function HebrewShinGame() {
  const dispatch = useAppDispatch();
  const active = useAppSelector((s) => s.session.active);
  const recording = useAppSelector((s) => s.session.recording);
  const interimText = useAppSelector((s) => s.session.interimText);
  const highlight = useAppSelector((s) => s.session.highlight);
  const sentences = useAppSelector((s) => s.sentences.items);
  const settings = useAppSelector((s) => s.settings);
  const logEntries = useAppSelector((s) => s.log.entries);

  const { start, stop, playRecording, playTTSHighlighted } = useGameEngine();

  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logEntries.length]);

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-background text-foreground p-6"
      data-testid="hebrew-shin-game"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="app-title">
              לימוד הגיית האות ש
            </h1>
            <p className="text-sm text-muted-foreground">
              לחץ "התחל", דבר משפט המכיל את האות ש
            </p>
          </div>
          <div className="flex gap-2">
            {!active ? (
              <Button
                data-testid="start-button"
                onClick={start}
                size="lg"
                className="text-lg"
              >
                התחל
              </Button>
            ) : (
              <Button
                data-testid="stop-button"
                onClick={stop}
                variant="destructive"
                size="lg"
              >
                עצור
              </Button>
            )}
          </div>
        </header>

        <section
          data-testid="main-board-section"
          className="rounded-lg border-2 border-dashed border-border p-8 min-h-40 flex items-center justify-center bg-card"
        >
          <div
            id="main_board"
            data-testid="main_board"
            className="text-4xl font-semibold text-center leading-relaxed"
          >
            {interimText || (
              <span className="text-muted-foreground text-xl">
                {active
                  ? recording
                    ? "🎤 מקליט..."
                    : "מעבד..."
                  : "לחץ 'התחל' כדי להתחיל"}
              </span>
            )}
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          <SettingsPanel />

          <section
            data-testid="log-panel"
            className="rounded-lg border border-border p-4 bg-card"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">יומן אירועים</h2>
              <Button
                data-testid="log-clear"
                size="sm"
                variant="outline"
                onClick={() => dispatch(clearLog())}
              >
                נקה
              </Button>
            </div>
            <div
              className="h-64 overflow-y-auto font-mono text-xs space-y-0.5 bg-muted/40 rounded p-2"
              dir="ltr"
            >
              {logEntries.map((e) => (
                <div key={e.id} data-testid={`log-entry-${e.tag}`} className="flex gap-2">
                  <span className="text-muted-foreground">
                    {new Date(e.time).toLocaleTimeString()}
                  </span>
                  <span className="font-bold" style={{ color: tagColor(e.tag) }}>
                    [{e.tag}]
                  </span>
                  <span className="flex-1">
                    {e.message}
                    {e.data ? ` ${e.data}` : ""}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        </div>

        <section data-testid="history-section" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">היסטוריית משפטים</h2>
            {sentences.length > 0 && (
              <Button
                data-testid="clear-history"
                size="sm"
                variant="outline"
                onClick={() => dispatch(clearAll())}
              >
                נקה הכל
              </Button>
            )}
          </div>
          {sentences.length === 0 && (
            <p className="text-sm text-muted-foreground">אין משפטים עדיין</p>
          )}
          <ul className="space-y-2">
            {sentences.map((s) => (
              <SentenceRow
                key={s.id}
                sentence={s}
                onPlay={() => playRecording(s, 0)}
                onPlayFromWord={(idx) => {
                  const w = s.words[idx];
                  const from = Math.max(0, w.time - settings.leadInMs / 1000);
                  playRecording(s, from);
                }}
                onTTS={() => playTTSHighlighted(s)}
                highlightedWord={
                  highlight?.sentenceId === s.id ? highlight.wordIndex : -1
                }
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SentenceRow({
  sentence,
  onPlay,
  onPlayFromWord,
  onTTS,
  highlightedWord,
}: {
  sentence: Sentence;
  onPlay: () => void;
  onPlayFromWord: (idx: number) => void;
  onTTS: () => void;
  highlightedWord: number;
}) {
  return (
    <li
      data-testid={`sentence-row-${sentence.id}`}
      className={`rounded-md border p-3 bg-card flex items-start gap-3 ${
        sentence.containsShin ? "border-primary/60" : "border-border"
      }`}
    >
      <div className="flex flex-col gap-1">
        <Button
          data-testid={`sentence-play-${sentence.id}`}
          size="sm"
          onClick={onPlay}
          disabled={!sentence.audioUrl}
        >
          ▶
        </Button>
        <Button
          data-testid={`sentence-tts-${sentence.id}`}
          size="sm"
          variant="outline"
          onClick={onTTS}
        >
          TTS
        </Button>
      </div>
      <div className="flex-1">
        <div className="text-xl leading-relaxed flex flex-wrap gap-x-2 gap-y-1">
          {sentence.words.length > 0
            ? sentence.words.map((w, i) => (
                <button
                  key={i}
                  data-testid={`sentence-word-${sentence.id}-${i}`}
                  onClick={() => onPlayFromWord(i)}
                  className={`px-1 rounded transition-colors ${
                    i === highlightedWord
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  } ${w.word.includes("ש") ? "underline decoration-primary decoration-2" : ""}`}
                >
                  {w.word}
                </button>
              ))
            : sentence.text}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(sentence.createdAt).toLocaleTimeString()} ·{" "}
          {(sentence.durationMs / 1000).toFixed(1)}s ·{" "}
          {sentence.containsShin ? "מכיל ש ✓" : "ללא ש"}
        </div>
      </div>
    </li>
  );
}

function SettingsPanel() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);
  return (
    <section
      data-testid="settings-panel"
      className="rounded-lg border border-border p-4 bg-card space-y-4"
    >
      <h2 className="font-semibold">הגדרות</h2>
      <div>
        <label className="text-sm block mb-1">
          Lead-in לפני מילה: {settings.leadInMs}ms
        </label>
        <input
          data-testid="lead-in-slider"
          type="range"
          min={0}
          max={1500}
          step={50}
          value={settings.leadInMs}
          onChange={(e) => dispatch(setLeadInMs(Number(e.target.value)))}
          className="w-full"
        />
      </div>
      <div>
        <div className="text-sm mb-2">פעולות כאשר מזוהה ש (בסדר):</div>
        <div className="flex flex-col gap-1">
          {(["playback", "word-tts", "sentence-tts"] as ActionType[]).map((a) => (
            <label
              key={a}
              className="flex items-center gap-2 text-sm cursor-pointer"
              data-testid={`action-toggle-${a}`}
            >
              <input
                type="checkbox"
                checked={settings.actions.includes(a)}
                onChange={() => dispatch(toggleAction(a))}
              />
              {ACTION_LABELS[a]}
              {settings.actions.includes(a) && (
                <span className="text-xs text-muted-foreground">
                  (#{settings.actions.indexOf(a) + 1})
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function tagColor(tag: string): string {
  const map: Record<string, string> = {
    sst: "#0ea5e9",
    sentence: "#22c55e",
    action: "#f59e0b",
    playback: "#a855f7",
    tts: "#ec4899",
    trim: "#f97316",
    session: "#3b82f6",
    recorder: "#ef4444",
    redux: "#64748b",
  };
  return map[tag] || "#000";
}
