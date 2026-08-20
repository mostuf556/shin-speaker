import { useAppDispatch, useAppSelector } from "@/store";
import { useGameEngine } from "@/hooks/useGameEngine";
import {
  setLeadInMs,
  toggleAction,
  ActionType,
  setTTSEngine,
  setBoardClearTimeoutMs,
  setRestartDelayMs,
  setHistoryView,
  HistoryView,
  toggleShowInterim,
  toggleRecordAudio,
} from "@/store/slices/settings";
import { clearLog } from "@/store/slices/log";
import { clearAll, Sentence } from "@/store/slices/sentences";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import type { AppStatus } from "@/store/slices/session";

const ACTION_LABELS: Record<ActionType, string> = {
  playback: "השמעת הקלטה",
  "word-tts": "TTS מילה",
  "sentence-tts": "TTS משפט",
};

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: "בהמתנה",
  recording: "מקליט",
  waiting: "השהיה לפני משפט הבא",
  "tts-word": "TTS מילה",
  "tts-sentence": "TTS משפט",
  "playback-in-game": "השמעה (במשחק)",
  "playback-out-of-game": "השמעה",
  error: "שגיאה",
};

// Semantic status → background tint
const STATUS_BG: Record<AppStatus, string> = {
  idle: "bg-background",
  recording: "bg-rose-50 dark:bg-rose-950/40",
  waiting: "bg-amber-50 dark:bg-amber-950/40",
  "tts-word": "bg-violet-50 dark:bg-violet-950/40",
  "tts-sentence": "bg-indigo-50 dark:bg-indigo-950/40",
  "playback-in-game": "bg-emerald-50 dark:bg-emerald-950/40",
  "playback-out-of-game": "bg-teal-50 dark:bg-teal-950/40",
  error: "bg-red-100 dark:bg-red-950/60",
};

const STATUS_CHIP: Record<AppStatus, { on: string; off: string }> = {
  idle: {
    on: "border-slate-500 bg-slate-500 text-white",
    off: "border-border bg-card text-muted-foreground",
  },
  recording: {
    on: "border-rose-500 bg-rose-500 text-white",
    off: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300",
  },
  waiting: {
    on: "border-amber-500 bg-amber-500 text-white",
    off: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
  },
  "tts-word": {
    on: "border-violet-500 bg-violet-500 text-white",
    off: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300",
  },
  "tts-sentence": {
    on: "border-indigo-500 bg-indigo-500 text-white",
    off: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300",
  },
  "playback-in-game": {
    on: "border-emerald-500 bg-emerald-500 text-white",
    off: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  "playback-out-of-game": {
    on: "border-teal-500 bg-teal-500 text-white",
    off: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/40 dark:bg-teal-950/30 dark:text-teal-300",
  },
  error: {
    on: "border-red-500 bg-red-500 text-white",
    off: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300",
  },
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as AppStatus[];

function AppStatusVisualizer({ status }: { status: AppStatus }) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid="app-status-visualizer"
      data-current-status={status}
      aria-label="app-status-visualizer"
    >
      {ALL_STATUSES.map((s) => {
        const active = s === status;
        return (
          <div
            key={s}
            data-testid={`status-chip-${s}`}
            data-active={active ? "true" : "false"}
            className={`rounded-md border px-2 py-1 text-[10px] sm:text-[11px] font-semibold tracking-wide transition-all ${
              active
                ? `${STATUS_CHIP[s].on} scale-105 shadow-sm`
                : `${STATUS_CHIP[s].off} opacity-70`
            }`}
          >
            {STATUS_LABELS[s]}
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
  const staleText = useAppSelector((s) => s.session.staleText);
  const highlight = useAppSelector((s) => s.session.highlight);
  const status = useAppSelector((s) => s.session.status);
  const micLevel = useAppSelector((s) => s.session.micLevel);
  const error = useAppSelector((s) => s.session.error);
  const sentences = useAppSelector((s) => s.sentences.items);
  const settings = useAppSelector((s) => s.settings);
  const logEntries = useAppSelector((s) => s.log.entries);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const { start, stop, playRecording, playTTSHighlighted, dismissError } =
    useGameEngine();

  const orderedLog = useMemo(() => [...logEntries].reverse(), [logEntries]);

  // Debug bundle: state snapshot + detected sentences + log lines.
  const buildDebugReport = () => {
    const lines: string[] = [];
    lines.push(`=== SHIN TRAINER DEBUG REPORT @ ${new Date().toISOString()} ===`);
    lines.push(
      `state: status=${status} active=${active} recording=${recording} micLevel=${micLevel.toFixed(3)}`,
    );
    lines.push(`board: interim="${interimText}" stale="${staleText}"`);
    lines.push(`error: ${error ? error.message : "none"}`);
    lines.push(
      `settings: ${JSON.stringify({
        ...settings,
      })}`,
    );
    lines.push("");
    lines.push(`=== DETECTED SENTENCES (${sentences.length}) ===`);
    if (sentences.length === 0) lines.push("(none)");
    sentences.forEach((s, i) => {
      lines.push(
        `#${i + 1} id=${s.id} at=${new Date(s.createdAt).toISOString()} dur=${(
          s.durationMs / 1000
        ).toFixed(2)}s shin=${s.containsShin} audio=${s.audioUrl ? "yes" : "no"}`,
      );
      lines.push(`   text: ${s.text}`);
      lines.push(
        `   words: ${s.words.map((w) => `${w.word}@${w.time.toFixed(2)}s`).join(" | ")}`,
      );
    });
    lines.push("");
    lines.push(`=== EVENT LOG (${logEntries.length}) ===`);
    logEntries.forEach((e) => {
      lines.push(
        `${new Date(e.time).toISOString()} [${e.tag}] ${e.message}${
          e.data ? " " + e.data : ""
        }${e.count > 1 ? ` (x${e.count})` : ""}`,
      );
    });
    return lines.join("\n");
  };

  const copyLog = async () => {
    const text = buildDebugReport();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopyStatus("copied");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(ta);
      setCopyStatus(copied ? "copied" : "failed");
    }
  };

  const historyView = settings.historyView;

  return (
    <div
      dir="rtl"
      data-testid="hebrew-shin-game"
      data-status={status}
      className={`min-h-screen text-foreground p-3 sm:p-6 transition-colors duration-300 ${STATUS_BG[status]}`}
    >
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1
                className="text-2xl sm:text-3xl font-bold"
                data-testid="app-title"
              >
                לימוד הגיית האות ש
              </h1>
              <p className="text-sm text-muted-foreground">
                לחץ "התחל", דבר משפט המכיל את האות ש
              </p>
            </div>
            <div className="shrink-0 sm:hidden">
              {!active ? (
                <Button
                  data-testid="start-button-mobile"
                  onClick={start}
                  size="lg"
                >
                  התחל
                </Button>
              ) : (
                <Button
                  data-testid="stop-button-mobile"
                  onClick={stop}
                  variant="destructive"
                  size="lg"
                >
                  עצור
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <AppStatusVisualizer status={status} />
            <div className="hidden sm:block">
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
            <div data-testid="error-message" className="font-mono text-sm break-words">
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
          className="rounded-lg border-2 border-dashed border-border p-4 sm:p-8 min-h-40 flex flex-col items-center justify-center bg-card gap-4"
        >
          <div
            id="main_board"
            data-testid="main_board"
            className={`text-2xl sm:text-4xl font-semibold text-center leading-relaxed break-words ${staleText ? "" : "text-muted-foreground"}`}
          >
            {staleText}
          </div>
        </section>

        <section
          data-testid="input-status-panel"
          className="rounded-lg border border-border bg-card p-3 sm:p-4"
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-sm">מצב קלט</h2>
            <span className="text-xs text-muted-foreground">
              {recording ? "מקליט" : "לא מקליט"}
            </span>
          </div>
          <MicMeter level={micLevel} recording={recording} />
        </section>

        {settings.showInterim && (
          <section
            data-testid="spoken-speech-panel"
            className="rounded-lg border border-border bg-card p-3 sm:p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-sm">דיבור ביניים (ניפוי שגיאות)</h2>
              <span className="text-xs text-muted-foreground" data-testid="spoken-speech-source">
                {interimText ? "בזמן אמת" : "—"}
              </span>
            </div>
            <p
              data-testid="spoken-speech-text"
              className="text-lg sm:text-2xl leading-relaxed break-words"
            >
              {interimText || (
                <span className="text-muted-foreground text-base">אין דיבור ביניים עדיין</span>
              )}
            </p>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
          <SettingsPanel />

          <section
            data-testid="log-panel"
            className="rounded-lg border border-border p-3 sm:p-4 bg-card"
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <h2 className="font-semibold">יומן אירועים</h2>
              <div className="flex gap-2">
                <Button
                  data-testid="log-copy"
                  size="sm"
                  variant="outline"
                  onClick={copyLog}
                >
                  {copyStatus === "copied"
                    ? "הדוח הועתק"
                    : copyStatus === "failed"
                      ? "ההעתקה נכשלה"
                      : "העתק דוח"}
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
              className="h-56 sm:h-64 overflow-y-auto font-mono text-[10px] sm:text-xs space-y-0.5 bg-muted/40 rounded p-2"
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
                  <span className="flex-1 break-all">
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

        <section data-testid="history-section" data-view={historyView} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg sm:text-xl font-semibold">
              היסטוריית משפטים ({sentences.length})
            </h2>
            <div className="flex flex-wrap gap-1.5" data-testid="history-view-toggle">
              {(
                [
                  ["expanded", "מורחב"],
                  ["shrinked", "מוקטן"],
                  ["hidden", "מוסתר"],
                ] as [HistoryView, string][]
              ).map(([v, label]) => (
                <Button
                  key={v}
                  data-testid={`history-view-${v}`}
                  size="sm"
                  variant={historyView === v ? "default" : "outline"}
                  onClick={() => dispatch(setHistoryView(v))}
                >
                  {label}
                </Button>
              ))}
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
          </div>

          {historyView !== "hidden" && sentences.length === 0 && (
            <p className="text-sm text-muted-foreground">אין משפטים עדיין</p>
          )}

          {historyView === "hidden" ? null : historyView === "shrinked" ? (
            <ul className="space-y-1" data-testid="history-list-shrinked">
              {sentences.map((s) => (
                <li
                  key={s.id}
                  data-testid={`sentence-compact-${s.id}`}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                >
                  <Button
                    data-testid={`sentence-play-${s.id}`}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => playRecording(s, 0)}
                    disabled={!s.audioUrl}
                  >
                    ▶
                  </Button>
                  <span className="flex-1 truncate">{s.text}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {s.containsShin ? "ש ✓" : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2" data-testid="history-list-expanded">
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
          )}
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
      <div className="flex flex-col gap-1 shrink-0">
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
      <div className="flex-1 min-w-0">
        <div className="text-lg sm:text-xl leading-relaxed flex flex-wrap gap-x-2 gap-y-1">
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
      className="rounded-lg border border-border p-3 sm:p-4 bg-card space-y-4"
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
        <label className="text-sm block mb-1">
          השהיה לפני משפט חדש: {(settings.restartDelayMs / 1000).toFixed(1)}s
        </label>
        <input
          data-testid="restart-delay-slider"
          type="range"
          min={0}
          max={10000}
          step={500}
          value={settings.restartDelayMs}
          onChange={(e) => dispatch(setRestartDelayMs(Number(e.target.value)))}
          className="w-full"
        />
      </div>
      <div className="text-xs text-muted-foreground" data-testid="lang-info">
        SST: {settings.sstEngine} ({settings.sstLang}) · TTS: {settings.ttsLang}
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          data-testid="show-interim-checkbox"
          type="checkbox"
          checked={settings.showInterim}
          onChange={() => dispatch(toggleShowInterim())}
        />
        הצג דיבור ביניים לניפוי שגיאות
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          data-testid="record-audio-checkbox"
          type="checkbox"
          checked={settings.recordAudio}
          onChange={() => dispatch(toggleRecordAudio())}
        />
        שמור הקלטת שמע
      </label>
      <div>
        <div className="text-sm mb-2">מנוע TTS:</div>
        <div className="flex flex-wrap gap-2" data-testid="tts-engine-toggle">
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
