import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  clearBoard,
  setHighlight,
  setInterim,
  setPlayback,
  setRecording,
  setActive,
  setStatus,
  setMicLevel,
  setError,
} from "@/store/slices/session";
import { addSentence, sentenceAddedToHistory, Sentence, WordTiming } from "@/store/slices/sentences";
import { appendLog } from "@/store/slices/log";
import { generateTTS } from "@/lib/tts.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

function extractWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function useGameEngine() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const activeRef = useRef(false);
  const errorPausedRef = useRef(false);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const wordsRef = useRef<WordTiming[]>([]);
  const knownWordsRef = useRef<string[]>([]);
  const loopingRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveRestartsRef = useRef(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const ttsPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const boardClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);

  const log = useCallback(
    (tag: any, message: string, data?: any) => {
      dispatch(
        appendLog({
          tag,
          message,
          data: data !== undefined ? JSON.stringify(data).slice(0, 200) : undefined,
        }),
      );
    },
    [dispatch],
  );

  const reportError = useCallback(
    (message: string, err?: unknown) => {
      const stack =
        err instanceof Error ? err.stack : err ? String(err) : undefined;
      log("error", message, stack?.slice(0, 400));
      dispatch(setError({ message, stack }));
      errorPausedRef.current = true;
      loopingRef.current = false;
    },
    [dispatch, log],
  );

  const stopMeter = useCallback(() => {
    if (meterRafRef.current != null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    try {
      audioCtxRef.current?.close();
    } catch {
      /* noop */
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    dispatch(setMicLevel(0));
  }, [dispatch]);

  const startMeter = useCallback(
    (stream: MediaStream) => {
      try {
        const AC: typeof AudioContext =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          const level = Math.min(1, rms * 3);
          dispatch(setMicLevel(level));
          meterRafRef.current = requestAnimationFrame(tick);
        };
        meterRafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        log("recorder", "meter init failed", (e as any)?.message);
      }
    },
    [dispatch, log],
  );

  const stopRecording = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    try {
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
    } catch {
      /* noop */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopMeter();
    dispatch(setRecording(false));
    log("recorder", "stopRecording");
  }, [dispatch, log, stopMeter]);

  async function playNativeTTS(text: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "he-IL";
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }

  async function playApiTTS(text: string): Promise<void> {
    const res = await generateTTS({ data: { text, voice: "alloy" } });
    const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
    ttsPlaybackRef.current = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }

  async function playTTS(text: string) {
    try {
      if (settingsRef.current.ttsEngine === "native") {
        await playNativeTTS(text);
      } else {
        await playApiTTS(text);
      }
    } catch (e: any) {
      reportError(`TTS failed: ${e?.message ?? e}`, e);
    }
  }

  const runActionsFor = useCallback(
    async (sentence: Sentence) => {
      const acts = settingsRef.current.actions;
      log("action", "running actions", acts);
      for (const act of acts) {
        if (errorPausedRef.current) return;
        if (act === "playback" && sentence.audioUrl) {
          dispatch(setStatus("playback-in-game"));
          await new Promise<void>((resolve) => {
            const audio = new Audio(sentence.audioUrl!);
            ttsPlaybackRef.current = audio;
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            log("playback", "action playback start");
            audio.play().catch(() => resolve());
          });
        } else if (act === "word-tts") {
          const shWord = sentence.words.find((w) => w.word.includes("ש"));
          if (shWord) {
            dispatch(setStatus("tts-word"));
            log("tts", "word-tts", shWord.word);
            await playTTS(shWord.word);
          }
        } else if (act === "sentence-tts") {
          dispatch(setStatus("tts-sentence"));
          log("tts", "sentence-tts", sentence.text);
          await playTTS(sentence.text);
        }
      }
    },
    [dispatch, log],
  );

  const startIteration = useCallback(async () => {
    if (!loopingRef.current) return;
    dispatch(clearBoard());
    log("session", "iteration start");

    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      reportError("SpeechRecognition not supported in this browser");
      dispatch(setActive(false));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: any) {
      reportError(`Microphone access denied: ${e?.message ?? e}`, e);
      dispatch(setActive(false));
      return;
    }
    streamRef.current = stream;
    startMeter(stream);

    const mr = new MediaRecorder(stream);
    mediaRecorderRef.current = mr;
    chunksRef.current = [];
    startedAtRef.current = performance.now();
    wordsRef.current = [];
    knownWordsRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = () => {
      const durationMs = performance.now() - startedAtRef.current;
      log("recorder", "stopped", { durationMs });
      // A successful stop with a real recording resets the restart counter.
      if (durationMs > 1000) consecutiveRestartsRef.current = 0;
    };

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = "he-IL";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTextThisRun = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      let finalPart = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalPart += r[0].transcript;
        else interim += r[0].transcript;
      }
      const combined = (finalTextThisRun + finalPart + interim).trim();
      dispatch(setInterim(combined));

      const currentWords = extractWords(combined);
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      for (let i = knownWordsRef.current.length; i < currentWords.length; i++) {
        wordsRef.current.push({ word: currentWords[i], time: elapsed });
      }
      knownWordsRef.current = currentWords;
      if (finalPart) log("sst", "final", finalPart);

      if (finalPart) {
        finalTextThisRun += finalPart;
        finalizeSentence(finalTextThisRun.trim());
      }
    };

    recognition.onerror = (e: any) => {
      const kind = e?.error || String(e);
      log("sst", "error", kind);
      // "no-speech" and "aborted" are recoverable — let onend handle the restart.
      if (kind === "no-speech" || kind === "aborted") {
        return;
      }
      reportError(`Speech recognition error: ${kind}`);
    };
    recognition.onend = () => {
      log("sst", "end");
      // If loop still active and no error, restart cleanly to keep listening.
      if (loopingRef.current && !errorPausedRef.current && activeRef.current) {
        try {
          if (mr.state !== "inactive") mr.stop();
        } catch {
          /* noop */
        }
        stream.getTracks().forEach((t) => t.stop());
        stopMeter();
        dispatch(setRecording(false));
        consecutiveRestartsRef.current += 1;
        // exponential backoff with jitter to avoid tight restart loops
        const base = Math.min(30000, 200 * 2 ** consecutiveRestartsRef.current);
        const backoff = base + Math.random() * 200;
        if (consecutiveRestartsRef.current > 8) {
          reportError("Speech recognition keeps aborting. Stopping the session.");
          dispatch(setActive(false));
          return;
        }
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (loopingRef.current) startIteration();
        }, backoff);
      }
    };

    const finalizeSentence = (text: string) => {
      if (!loopingRef.current) return;
      loopingRef.current = false;
      try {
        recognition.stop();
      } catch {
        /* noop */
      }

      const finishAndProcess = () => {
        const durationMs = performance.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        stream.getTracks().forEach((t) => t.stop());
        stopMeter();

        const containsShin = text.includes("ש");
        const sentence: Sentence = {
          id: `s-${Date.now()}`,
          text,
          createdAt: Date.now(),
          audioUrl: url,
          durationMs,
          words: wordsRef.current.slice(),
          containsShin,
        };
        log("sentence", "saved", { text, containsShin, words: sentence.words.length });
        dispatch(addSentence(sentence));
        dispatch(sentenceAddedToHistory({ id: sentence.id, text: sentence.text }));

        // Clear the main board after configured timeout
        if (boardClearTimerRef.current) clearTimeout(boardClearTimerRef.current);
        boardClearTimerRef.current = setTimeout(() => {
          dispatch(clearBoard());
        }, settingsRef.current.boardClearTimeoutMs);

        (async () => {
          if (containsShin && !errorPausedRef.current) {
            await runActionsFor(sentence);
          }
          if (errorPausedRef.current || !activeRef.current) return;
          loopingRef.current = true;
          dispatch(setRecording(false));
          dispatch(setStatus("recording"));
          startIteration();
        })();
      };

      if (mr.state !== "inactive") {
        mr.onstop = finishAndProcess;
        mr.stop();
      } else {
        finishAndProcess();
      }
    };

    mr.start();
    recognition.start();
    dispatch(setRecording(true));
    dispatch(setStatus("recording"));
    log("recorder", "started");
    log("sst", "started");
  }, [dispatch, log, reportError, runActionsFor, startMeter, stopMeter]);

  const start = useCallback(() => {
    if (loopingRef.current) return;
    errorPausedRef.current = false;
    activeRef.current = true;
    loopingRef.current = true;
    dispatch(setActive(true));
    log("session", "start");
    startIteration();
  }, [dispatch, log, startIteration]);

  const stop = useCallback(() => {
    loopingRef.current = false;
    activeRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    consecutiveRestartsRef.current = 0;
    dispatch(setActive(false));
    dispatch(setStatus("idle"));
    stopRecording();
    log("session", "stop");
  }, [dispatch, log, stopRecording]);

  const dismissError = useCallback(() => {
    dispatch(setError(null));
    errorPausedRef.current = false;
    dispatch(setStatus(activeRef.current ? "recording" : "idle"));
    if (activeRef.current) {
      loopingRef.current = true;
      startIteration();
    }
  }, [dispatch, startIteration]);

  const playRecording = useCallback(
    (sentence: Sentence, fromTime: number = 0) => {
      if (!sentence.audioUrl) {
        log("playback", "no audio url", sentence.id);
        return;
      }
      audioElementRef.current?.pause();
      const audio = new Audio(sentence.audioUrl);
      audioElementRef.current = audio;
      audio.currentTime = Math.max(0, fromTime);
      dispatch(
        setStatus(activeRef.current ? "playback-in-game" : "playback-out-of-game"),
      );
      dispatch(setPlayback({ sentenceId: sentence.id, currentTime: fromTime }));
      log("playback", "start", { id: sentence.id, fromTime });

      audio.ontimeupdate = () => {
        const t = audio.currentTime;
        dispatch(setPlayback({ sentenceId: sentence.id, currentTime: t }));
        let idx = -1;
        for (let i = 0; i < sentence.words.length; i++) {
          if (sentence.words[i].time <= t) idx = i;
          else break;
        }
        dispatch(
          setHighlight(
            idx >= 0
              ? { source: "playback", sentenceId: sentence.id, wordIndex: idx }
              : null,
          ),
        );
      };
      audio.onended = () => {
        log("playback", "ended", sentence.id);
        dispatch(setPlayback({ sentenceId: null }));
        dispatch(setHighlight(null));
        if (!activeRef.current) dispatch(setStatus("idle"));
        else dispatch(setStatus("recording"));
      };
      audio.play().catch((e) => {
        log("playback", "play error", e?.message);
        reportError(`Playback failed: ${e?.message ?? e}`, e);
      });
    },
    [dispatch, log, reportError],
  );

  const playTTSHighlighted = useCallback(
    async (sentence: Sentence) => {
      log("tts", "start", sentence.text);
      dispatch(setStatus("tts-sentence"));
      try {
        if (settingsRef.current.ttsEngine === "native") {
          // Native has no reliable per-word timing; approximate over duration.
          const total = Math.max(1, sentence.words.length) * 0.45;
          const start = performance.now();
          const timer = window.setInterval(() => {
            const elapsed = (performance.now() - start) / 1000;
            const per = total / Math.max(1, sentence.words.length);
            const idx = Math.min(
              sentence.words.length - 1,
              Math.floor(elapsed / per),
            );
            dispatch(
              setHighlight({ source: "tts", sentenceId: sentence.id, wordIndex: idx }),
            );
          }, 80);
          await playNativeTTS(sentence.text);
          clearInterval(timer);
          dispatch(setHighlight(null));
        } else {
          const res = await generateTTS({
            data: { text: sentence.text, voice: "alloy" },
          });
          const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
          ttsPlaybackRef.current = audio;
          audio.onloadedmetadata = () => {
            const dur = audio.duration || 1;
            const per = dur / Math.max(1, sentence.words.length);
            audio.ontimeupdate = () => {
              const idx = Math.min(
                sentence.words.length - 1,
                Math.floor(audio.currentTime / per),
              );
              dispatch(
                setHighlight({
                  source: "tts",
                  sentenceId: sentence.id,
                  wordIndex: idx,
                }),
              );
            };
          };
          audio.onended = () => {
            dispatch(setHighlight(null));
            log("tts", "ended");
          };
          await audio.play();
        }
        if (!activeRef.current) dispatch(setStatus("idle"));
      } catch (e: any) {
        reportError(`TTS failed: ${e?.message ?? e}`, e);
      }
    },
    [dispatch, log, reportError],
  );

  useEffect(() => {
    return () => {
      loopingRef.current = false;
      activeRef.current = false;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      consecutiveRestartsRef.current = 0;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopMeter();
      if (boardClearTimerRef.current) clearTimeout(boardClearTimerRef.current);
    };
  }, [stopMeter]);

  return { start, stop, playRecording, playTTSHighlighted, dismissError };
}
