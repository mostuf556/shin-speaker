import { useAppDispatch, useAppSelector } from "@/store";
import { useGameEngine } from "@/hooks/useGameEngine";
import {
  setLeadInMs,
  toggleAction,
  ActionType,
  setTTSEngine,
  setBoardClearTimeoutMs,
} from "@/store/slices/settings";
import { clearLog } from "@/store/slices/log";
import { clearAll, Sentence } from "@/store/slices/sentences";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import type { AppStatus } from "@/store/slices/session";

const ACTION_LABELS: Record<ActionType, string> = {
  playback: "השמעת הקלטה",
  "word-tts": "TTS מילה",
  "sentence-tts": "TTS משפט",
};

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: "בהמתנה",
  recording: "מקליט",
  "tts-word": "TTS מילה",
  "tts-sentence": "TTS משפט",
  "playback-in-game": "השמעה (במשחק)",
  "playback-out-of-game": "השמעה",
  error: "שגיאה",
};

// Semantic status → background tint (uses design tokens via inline oklch mix)
const STATUS_BG: Record<AppStatus, string> = {
  idle: "bg-background",
  recording: "bg-rose-50 dark:bg-rose-950/40",
  "tts-word": "bg-violet-50 dark:bg-violet-950/40",
  "tts-sentence": "bg-indigo-50 dark:bg-indigo-950/40",
  "playback-in-game": "bg-emerald-50 dark:bg-emerald-950/40",
  "playback-out-of-game": "bg-teal-50 dark:bg-teal-950/40",
  error: "bg-red-100 dark:bg-red-950/60",
};

const STATUS_COLUMNS = [
  { key: "idle", label: "idle" },
  { key: "playing", label: "playing" },
  { key: "recording", label: "recording" },
  { key: "error", label: "error" },
] as const;

function AppStatusVisualizer({ status }: { status: AppStatus }) {
  const column =
    status === "error"
      ? "error"
      : status === "recording"
        ? "recording"
        : status === "idle"
          ? "idle"
          : "playing";

  return (
    <div className="flex items-center gap-2" aria-label="app-status-visualizer">
      {STATUS_COLUMNS.map((item) => {
        const active = column === item.key;
        const baseClass =
          "min-w-20 rounded-md border px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors";
        const activeClass =
          item.key === "error"
            ? "border-red-500 bg-red-500 text-white"
            : item.key === "recording"
              ? "border-rose-500 bg-rose-500 text-white"
              : item.key === "playing"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border bg-background text-foreground";
        const inactiveClass =
          item.key === "error"
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
            : item.key === "recording"
              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"
              : item.key === "playing"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border-border bg-card text-muted-foreground";

        return (
          <div
            key={item.key}
            className={`${baseClass} ${active ? activeClass : inactiveClass}`}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

export function HebrewShinGame() {
  const dispatch = useAppDispatch();
  const active = useAppSelector((s) => s.session.active);
  const recording = useAppSelector((s) => s.session.recording);
  const interimText = useAppSelector((s) => s.session.interimText);
  const highlight = useAppSelector((s) => s.session.highlight);
  const status = useAppSelector((s) => s.session.status);
  const micLevel = useAppSelector((s) => s.session.micLevel);
  const error = useAppSelector((s) => s.session.error);
  const sentences = useAppSelector((s) => s.sentences.items);
  const settings = useAppSelector((s) => s.settings);
  const logEntries = useAppSelector((s) => s.log.entries);

  const { start, stop, playRecording, playTTSHighlighted, dismissError } =
    useGameEngine();

  const orderedLog = useMemo(() => [...logEntries].reverse(), [logEntries]);

  const copyLog = async () => {
    const text = logEntries
      .map(
        (e) =>
          `${new Date(e.time).toISOString()} [${e.tag}] ${e.message}${
            e.data ? " " + e.data : ""
          }${e.count > 1 ? ` (x${e.count})` : ""}`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      dir="rtl"
      data-testid="hebrew-shin-game"
      data-status={status}
      className={`min-h-screen text-foreground p-6 transition-colors duration-300 ${STATUS_BG[status]}`}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="app-title">
              לימוד הגיית האות ש
            </h1>
            <p className="text-sm text-muted-foreground">
              לחץ "התחל", דבר משפט המכיל את האות ש
            </p>
          </div>
          <div className="flex items-center gap-3">
            <AppStatusVisualizer status={status} />
            {!active ? (
              <Button
                data-testid="start-button"
                onClick={start}
                size="lg"
                className="text-lg"
                disabled={!!error}
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

        {error && (
          <section
            data-testid="error-panel"
            dir="ltr"
            className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/60 p-4 space-y-2"
          >
            <div className="font-bold text-red-700 dark:text-red-300">
              Error — waiting for confirmation to continue
            </div>
            <div data-testid="error-message" className="font-mono text-sm">
              {error.message}
            </div>
            {error.stack && (
              <pre
                data-testid="error-stack"
                className="text-xs whitespace-pre-wrap bg-black/5 dark:bg-white/5 rounded p-2 max-h-48 overflow-auto"
              >
                {error.stack}
              </pre>
            )}
            <div className="flex gap-2">
              <Button
                data-testid="error-dismiss"
                size="sm"
                onClick={dismissError}
              >
                Continue
              </Button>
            </div>
          </section>
        )}

        <section
          data-testid="main-board-section"
          className="rounded-lg border-2 border-dashed border-border p-8 min-h-40 flex flex-col items-center justify-center bg-card gap-4"
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
          <MicMeter level={micLevel} recording={recording} />
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          <SettingsPanel />

          <section
            data-testid="log-panel"
            className="rounded-lg border border-border p-4 bg-card"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">יומן אירועים</h2>
              <div className="flex gap-2">
                <Button
                  data-testid="log-copy"
                  size="sm"
                  variant="outline"
                  onClick={copyLog}
                >
                  העתק
                </Button>
                <Button
                  data-testid="log-clear"
                  size="sm"
                  variant="outline"
                  onClick={() => dispatch(clearLog())}
                >
                  נקה
                </Button>
              </div>
            </div>
            <div
              className="h-64 overflow-y-auto font-mono text-xs space-y-0.5 bg-muted/40 rounded p-2"
              dir="ltr"
            >
              {orderedLog.map((e) => (
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
                  {e.count > 1 && (
                    <span
                      data-testid="log-count"
                      className="text-muted-foreground"
                    >
                      ×{e.count}
                    </span>
                  )}
                </div>
              ))}
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
                highlightSource={
                  highlight?.sentenceId === s.id ? highlight.source : null
                }
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function MicMeter({ level, recording }: { level: number; recording: boolean }) {
  const bars = 24;
  const active = Math.round(level * bars);
  return (
    <div
      data-testid="mic-meter"
      data-mic-level={level.toFixed(3)}
      className="flex items-end gap-0.5 h-10 w-full max-w-md"
      dir="ltr"
    >
      {Array.from({ length: bars }).map((_, i) => {
        const on = i < active;
        const h = 20 + (i / bars) * 80;
        return (
          <span
            key={i}
            className={`flex-1 rounded-sm transition-colors ${
              on
                ? i > bars * 0.75
                  ? "bg-red-500"
                  : i > bars * 0.5
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                : recording
                  ? "bg-muted"
                  : "bg-muted/50"
            }`}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

function SentenceRow({
  sentence,
  onPlay,
  onPlayFromWord,
  onTTS,
  highlightedWord,
  highlightSource,
}: {
  sentence: Sentence;
  onPlay: () => void;
  onPlayFromWord: (idx: number) => void;
  onTTS: () => void;
  highlightedWord: number;
  highlightSource: "playback" | "tts" | null;
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
            ? sentence.words.map((w, i) => {
                const isHi = i === highlightedWord;
                const hiCls = isHi
                  ? highlightSource === "tts"
                    ? "bg-indigo-500 text-white shadow-sm scale-110"
                    : "bg-emerald-500 text-white shadow-sm scale-110"
                  : "hover:bg-accent";
                return (
                  <button
                    key={i}
                    data-testid={`sentence-word-${sentence.id}-${i}`}
                    data-highlighted={isHi ? "true" : "false"}
                    onClick={() => onPlayFromWord(i)}
                    className={`px-1 rounded transition-all duration-150 ${hiCls} ${
                      w.word.includes("ש")
                        ? "underline decoration-primary decoration-2"
                        : ""
                    }`}
                  >
                    {w.word}
                  </button>
                );
              })
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
        <label className="text-sm block mb-1">
          ניקוי לוח לאחר משפט: {settings.boardClearTimeoutMs}ms
        </label>
        <input
          data-testid="board-clear-slider"
          type="range"
          min={500}
          max={10000}
          step={500}
          value={settings.boardClearTimeoutMs}
          onChange={(e) =>
            dispatch(setBoardClearTimeoutMs(Number(e.target.value)))
          }
          className="w-full"
        />
      </div>
      <div>
        <div className="text-sm mb-2">מנוע TTS:</div>
        <div className="flex gap-2" data-testid="tts-engine-toggle">
          <Button
            data-testid="tts-engine-api"
            size="sm"
            variant={settings.ttsEngine === "api" ? "default" : "outline"}
            onClick={() => dispatch(setTTSEngine("api"))}
          >
            API (Lovable AI)
          </Button>
          <Button
            data-testid="tts-engine-native"
            size="sm"
            variant={settings.ttsEngine === "native" ? "default" : "outline"}
            onClick={() => dispatch(setTTSEngine("native"))}
          >
            Native
          </Button>
        </div>
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
    error: "#dc2626",
    status: "#0891b2",
  };
  return map[tag] || "#000";
}
