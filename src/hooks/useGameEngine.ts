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
  setStaleText,
} from "@/store/slices/session";
import { addSentence, sentenceAddedToHistory, Sentence, WordTiming } from "@/store/slices/sentences";
import { appendLog } from "@/store/slices/log";
import { generateTTS } from "@/lib/tts.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

function extractWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function mergeRecognitionSegments(segments: string[]): string {
  const words: string[] = [];
  for (const segment of segments) {
    const segmentWords = extractWords(segment);
    let overlap = 0;
    const maxOverlap = Math.min(words.length, segmentWords.length);
    for (let size = maxOverlap; size > 0; size--) {
      const previous = words.slice(-size).join(" ");
      const next = segmentWords.slice(0, size).join(" ");
      if (previous === next) {
        overlap = size;
        break;
      }
    }
    words.push(...segmentWords.slice(overlap));
  }
  return words.join(" ");
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
  const currentSentenceRef = useRef("");

  const log = useCallback(
    (tag: any, message: string, data?: any) => {
      dispatch(
        appendLog({
          tag,
          message,
          data: data !== undefined ? JSON.stringify(data).slice(0, 1000) : undefined,
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

  const stopSpeechForPlayback = useCallback(() => {
    loopingRef.current = false;
    activeRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    stopRecording();
    dispatch(setActive(false));
    dispatch(setStatus("idle"));
    log("session", "stopped for playback");
  }, [dispatch, log, stopRecording]);

  async function playNativeTTS(text: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = settingsRef.current.ttsLang;
        log("tts", "start", { engine: "native", text, lang: u.lang });
        log("tts", "lang assigned (native)", {
          engine: "native",
          lang: u.lang,
        });
        u.onend = () => {
          log("tts", "ended", { engine: "native" });
          resolve();
        };
        u.onerror = (event: any) => {
          log("tts", "error", { engine: "native", error: event?.error });
          resolve();
        };
        window.speechSynthesis.speak(u);
      } catch (e: any) {
        log("tts", "error", { engine: "native", message: e?.message ?? String(e) });
        resolve();
      }
    });
  }

  async function playApiTTS(text: string): Promise<void> {
    log("tts", "start", { engine: "api", text });
    log("tts", "lang assigned (api)", {
      engine: "api",
      lang: settingsRef.current.ttsLang,
      voice: "alloy",
    });
    const res = await generateTTS({ data: { text, voice: "alloy" } });
    const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
    ttsPlaybackRef.current = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => {
        log("tts", "ended", { engine: "api" });
        resolve();
      };
      audio.onerror = () => {
        log("tts", "error", { engine: "api", stage: "audio" });
        resolve();
      };
      audio.play().catch((error) => {
        log("tts", "error", { engine: "api", stage: "play", message: error?.message });
        resolve();
      });
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
      log("tts", "error", { message: e?.message ?? String(e) });
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
    dispatch(setInterim(""));
    log("session", "iteration start");

    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      reportError("SpeechRecognition not supported in this browser");
      dispatch(setActive(false));
      return;
    }
    if (settingsRef.current.sstEngine !== "native") {
      reportError(`Unsupported SST engine: ${settingsRef.current.sstEngine}`);
      return;
    }

    const shouldRecordAudio = settingsRef.current.recordAudio;
    let stream: MediaStream | null = null;
    let recorderStarted = false;
    if (shouldRecordAudio) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        log("recorder", "microphone unavailable", {
          message: e?.message ?? String(e),
        });
      }
      if (stream) {
        streamRef.current = stream;
        startMeter(stream);
      }
    }
    let mr: MediaRecorder | null = null;
    if (shouldRecordAudio && stream) {
      try {
        const preferredMimeTypes = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ];
        const mimeType = preferredMimeTypes.find((type) =>
          MediaRecorder.isTypeSupported(type),
        );
        mr = mimeType
          ? new MediaRecorder(stream!, { mimeType })
          : new MediaRecorder(stream!);
        log("recorder", "configured", {
          mimeType: mr.mimeType || mimeType || "browser-default",
        });
      } catch (e: any) {
        log("recorder", "unavailable", { message: e?.message ?? String(e) });
        stream?.getTracks().forEach((t) => t.stop());
        stopMeter();
        stream = null;
        streamRef.current = null;
      }
    }
    mediaRecorderRef.current = mr;
    chunksRef.current = [];
    startedAtRef.current = performance.now();
    wordsRef.current = [];
    knownWordsRef.current = [];
    currentSentenceRef.current = "";

    if (mr) {
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const durationMs = performance.now() - startedAtRef.current;
        log("recorder", "stopped", { durationMs });
        // A successful stop with a real recording resets the restart counter.
        if (durationMs > 1000) consecutiveRestartsRef.current = 0;
      };
    }

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = settingsRef.current.sstLang;
    recognition.continuous = settingsRef.current.sstMode === "continuous";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    log("sst", "lang assigned", {
      engine: settingsRef.current.sstEngine,
      mode: settingsRef.current.sstMode,
      lang: recognition.lang,
      continuous: recognition.continuous,
      interimResults: true,
      maxAlternatives: 1,
    });

    const logRecognitionEvent = (eventName: string, data?: unknown) => {
      log("sst", eventName, data);
    };
    let resultWatchdog: ReturnType<typeof setTimeout> | null = null;
    let sentenceEndTimer: ReturnType<typeof setTimeout> | null = null;
    const clearResultWatchdog = () => {
      if (resultWatchdog) clearTimeout(resultWatchdog);
      resultWatchdog = null;
    };
    const clearSentenceEndTimer = () => {
      if (sentenceEndTimer) clearTimeout(sentenceEndTimer);
      sentenceEndTimer = null;
    };

    recognition.onstart = () => logRecognitionEvent("start");
    recognition.onaudiostart = () => logRecognitionEvent("audio-start");
    recognition.onaudioend = () => logRecognitionEvent("audio-end");
    recognition.onsoundstart = () => logRecognitionEvent("sound-start");
    recognition.onsoundend = () => logRecognitionEvent("sound-end");
    recognition.onspeechstart = () => {
      logRecognitionEvent("speech-start");
      receivedTranscript = false;
      sentenceStartResultIndex = lastResultCount;
      currentSentenceRef.current = "";
      wordsRef.current = [];
      knownWordsRef.current = [];
    };
    recognition.onspeechend = () => logRecognitionEvent("speech-end");
    recognition.onnomatch = (event: any) =>
      logRecognitionEvent("no-match", {
        type: event?.type,
        timeStamp: event?.timeStamp,
      });

    let finalizedThisRun = false;
    let receivedTranscript = false;
    let sentenceStartResultIndex = 0;
    let lastResultCount = 0;

    recognition.onresult = (event: any) => {
      clearResultWatchdog();
      lastResultCount = event.results.length;
      const result = event.results[event.results.length - 1];
      logRecognitionEvent("result-received", {
        resultIndex: event.resultIndex,
        resultCount: event.results.length,
        latestIsFinal: result?.isFinal ?? false,
        alternatives: result
          ? Array.from(result).map((alternative: any) => ({
              transcript: alternative.transcript,
              confidence: alternative.confidence,
            }))
          : [],
      });
      if (!result) return;

      const transcript = mergeRecognitionSegments(
        Array.from(event.results as ArrayLike<any>).slice(sentenceStartResultIndex)
          .map((item: any) => item[0]?.transcript ?? ""),
      );
      const displayTranscript = result[0]?.transcript?.trim() ?? "";
      if (!transcript) {
        logRecognitionEvent("no-transcript", {
          resultIndex: event.resultIndex,
          resultCount: event.results.length,
        });
        return;
      }

      if (!receivedTranscript) {
        receivedTranscript = true;
        dispatch(setStaleText(""));
        logRecognitionEvent("new-sentence-display");
      }
      currentSentenceRef.current = transcript;

      if (settingsRef.current.sentenceEndDetection === "timeout") {
        clearSentenceEndTimer();
        sentenceEndTimer = setTimeout(() => {
          if (finalizedThisRun || !currentSentenceRef.current) return;
          finalizedThisRun = true;
          const normalizedFinal = currentSentenceRef.current;
          logRecognitionEvent("sentence-end", {
            text: normalizedFinal,
            reason: "timeout",
          });
          log("sst", "final-from-timeout", normalizedFinal);
          dispatch(setStaleText(normalizedFinal));
          dispatch(setInterim(""));
          finalizeSentence(normalizedFinal);
        }, settingsRef.current.boardClearTimeoutMs);
      }

      log("sst", result.isFinal ? "final-result" : "interim-result", {
        transcript,
        isFinal: result.isFinal,
      });

      const currentWords = extractWords(transcript);
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      for (let i = knownWordsRef.current.length; i < currentWords.length; i++) {
        logRecognitionEvent("word-end", {
          word: currentWords[i],
          wordIndex: i,
          elapsed,
        });
      }
      const newWords: WordTiming[] = [];
      const newWordCount = Math.max(0, currentWords.length - wordsRef.current.length);
      const previousWordTime =
        wordsRef.current.length > 0
          ? wordsRef.current[wordsRef.current.length - 1].time
          : 0;
      let newWordOrdinal = 0;
      for (let i = 0; i < currentWords.length; i++) {
        const existing = wordsRef.current[i];
        if (existing && existing.word === currentWords[i]) {
          newWords.push(existing);
        } else {
          newWordOrdinal += 1;
          const progress =
            newWordCount > 0 ? newWordOrdinal / newWordCount : 1;
          const time =
            previousWordTime + (elapsed - previousWordTime) * progress;
          newWords.push({ word: currentWords[i], time });
        }
      }
      wordsRef.current = newWords;
      knownWordsRef.current = currentWords;
      dispatch(setInterim(displayTranscript || transcript));

      if (
        result.isFinal &&
        settingsRef.current.sentenceEndDetection === "native"
      ) {
        if (finalizedThisRun) return;
        finalizedThisRun = true;
        const normalizedFinal = transcript;
        logRecognitionEvent("sentence-end", {
          text: normalizedFinal,
          reason: "final-result",
        });
        log("sst", "final", normalizedFinal);
        dispatch(setStaleText(normalizedFinal));
        dispatch(setInterim(""));
        finalizeSentence(normalizedFinal);
        wordsRef.current = [];
        knownWordsRef.current = [];
      }
    };

    recognition.onerror = (e: any) => {
      const kind = e?.error || String(e);
      log("sst", "error", {
        kind,
        message: e?.message,
        type: e?.type,
        timeStamp: e?.timeStamp,
        recoverable: kind === "no-speech" || kind === "aborted",
      });
      // "no-speech" and "aborted" are recoverable — let onend handle the restart.
      if (kind === "no-speech" || kind === "aborted") {
        return;
      }
      reportError(`Speech recognition error: ${kind}`);
    };
    recognition.onend = () => {
      clearResultWatchdog();
      log("sst", "end", {
        finalized: finalizedThisRun,
        hasTranscript: Boolean(currentSentenceRef.current),
      });
      if (!loopingRef.current || errorPausedRef.current || !activeRef.current) return;
      if (finalizedThisRun) {
        return;
      }
      if (
        currentSentenceRef.current &&
        settingsRef.current.sentenceEndDetection === "native"
      ) {
        finalizedThisRun = true;
        const normalizedFinal = currentSentenceRef.current;
        logRecognitionEvent("sentence-end", {
          text: normalizedFinal,
          reason: "recognition-end",
        });
        log("sst", "final-from-end", normalizedFinal);
        dispatch(setStaleText(normalizedFinal));
        dispatch(setInterim(""));
        finalizeSentence(normalizedFinal);
        return;
      }
      if (currentSentenceRef.current) {
        logRecognitionEvent("sentence-end-waiting", {
          timeoutMs: settingsRef.current.boardClearTimeoutMs,
        });
        return;
      }
      log("sst", "no-result", { reason: "recognition-ended-without-transcript" });
      try {
        if (mr && mr.state !== "inactive") mr.stop();
      } catch {
        /* noop */
      }
      stream?.getTracks().forEach((t) => t.stop());
      stopMeter();
      dispatch(setRecording(false));
      if (!settingsRef.current.autoRestartSST) {
        dispatch(setActive(false));
        dispatch(setStatus("idle"));
        log("sst", "auto-restart-disabled");
        return;
      }
      consecutiveRestartsRef.current += 1;
      const base = Math.min(30000, 200 * 2 ** consecutiveRestartsRef.current);
      const backoff = base + Math.random() * 200;
      if (consecutiveRestartsRef.current > 8) {
        reportError("Speech recognition keeps aborting. Stopping the session.");
        dispatch(setActive(false));
        return;
      }
      log("sst", "restart-scheduled", { backoffMs: Math.round(backoff) });
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (loopingRef.current) startIteration();
      }, backoff);
    };

    const finalizeSentence = (text: string) => {
      if (!loopingRef.current) return;
      loopingRef.current = false;
      clearSentenceEndTimer();
      try {
        recognition.stop();
      } catch {
        /* noop */
      }

      const finishAndProcess = () => {
        clearResultWatchdog();
        const durationMs = performance.now() - startedAtRef.current;
        const url = mr
          ? URL.createObjectURL(
              new Blob(chunksRef.current, {
                type: mr.mimeType || "audio/webm",
              }),
            )
          : null;
        stream?.getTracks().forEach((t) => t.stop());
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

        (async () => {
          if (containsShin && !errorPausedRef.current) {
            await runActionsFor(sentence);
          }
          if (errorPausedRef.current || !activeRef.current) return;
          const delay = settingsRef.current.restartDelayMs;
          if (!settingsRef.current.autoRestartSST) {
            dispatch(setActive(false));
            dispatch(setStatus("idle"));
            log("sst", "auto-restart-disabled");
            return;
          }
          dispatch(setStatus("waiting"));
          log("session", "waiting before next sentence", { delayMs: delay });
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            restartTimerRef.current = null;
            if (errorPausedRef.current || !activeRef.current) return;
            loopingRef.current = true;
            dispatch(setStatus("recording"));
            startIteration();
          }, delay);
        })();

      };

      if (mr && mr.state !== "inactive") {
        mr.onstop = finishAndProcess;
        mr.stop();
      } else {
        finishAndProcess();
      }
    };

    try {
      if (mr) {
        try {
          mr.start();
          recorderStarted = true;
          log("recorder", "started");
        } catch (e: any) {
          log("recorder", "start failed", { message: e?.message ?? String(e) });
          try {
            stream?.getTracks().forEach((t) => t.stop());
          } catch {
            /* noop */
          }
          stopMeter();
          stream = null;
          streamRef.current = null;
          mr = null;
          mediaRecorderRef.current = null;
        }
      }
      recognition.start();
      resultWatchdog = setTimeout(() => {
        if (finalizedThisRun || currentSentenceRef.current) return;
        logRecognitionEvent("result-timeout", { timeoutMs: 15000 });
        try {
          recognition.stop();
        } catch {
          /* noop */
        }
      }, 15000);
    } catch (e: any) {
      log("sst", "start failed", e?.message ?? e);
      try {
        if (mr && mr.state !== "inactive") mr.stop();
      } catch {
        /* noop */
      }
      stream?.getTracks().forEach((t) => t.stop());
      stopMeter();
      dispatch(setRecording(false));
      reportError(`Speech recognition could not start: ${e?.message ?? e}`, e);
      return;
    }
    dispatch(setRecording(true));
    dispatch(setStatus("recording"));
    log("recorder", recorderStarted ? "started" : "disabled");
    log("sst", "started");
  }, [dispatch, log, reportError, runActionsFor, startMeter, stopMeter]);

  const start = useCallback(() => {
    if (loopingRef.current) return;
    errorPausedRef.current = false;
    activeRef.current = true;
    loopingRef.current = true;
    dispatch(setError(null));
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
      stopSpeechForPlayback();
      audioElementRef.current?.pause();
      const audio = new Audio(sentence.audioUrl);
      audioElementRef.current = audio;
      let timingScale = 1;
      const sourceTime = Math.max(0, fromTime);
      audio.currentTime = sourceTime;
      dispatch(
        setStatus(activeRef.current ? "playback-in-game" : "playback-out-of-game"),
      );
      dispatch(setPlayback({ sentenceId: sentence.id, currentTime: fromTime }));
      const initialWordIndex = sentence.words.reduce(
        (index, word, i) => (word.time <= sourceTime ? i : index),
        -1,
      );
      dispatch(
        setHighlight(
          initialWordIndex >= 0
            ? { source: "playback", sentenceId: sentence.id, wordIndex: initialWordIndex }
            : null,
        ),
      );
      log("playback", "start", { id: sentence.id, fromTime });

      let playbackRaf: number | null = null;
      let lastHighlightedWord = initialWordIndex;
      const updatePlaybackPosition = () => {
        const t = audio.currentTime;
        dispatch(setPlayback({ sentenceId: sentence.id, currentTime: t }));
        const sourcePosition = t / timingScale;
        let idx = -1;
        for (let i = 0; i < sentence.words.length; i++) {
          if (sentence.words[i].time <= sourcePosition) idx = i;
          else break;
        }
        if (idx !== lastHighlightedWord) {
          lastHighlightedWord = idx;
          dispatch(
            setHighlight(
              idx >= 0
                ? { source: "playback", sentenceId: sentence.id, wordIndex: idx }
                : null,
            ),
          );
        }
      };
      const tickPlayback = () => {
        updatePlaybackPosition();
        if (!audio.paused && !audio.ended) {
          playbackRaf = requestAnimationFrame(tickPlayback);
        }
      };
      audio.ontimeupdate = updatePlaybackPosition;
      audio.onloadedmetadata = () => {
        const recordedDuration = sentence.durationMs / 1000;
        if (recordedDuration > 0 && Number.isFinite(audio.duration)) {
          timingScale = audio.duration / recordedDuration;
          audio.currentTime = sourceTime * timingScale;
          updatePlaybackPosition();
        }
      };
      audio.onplay = () => {
        if (playbackRaf == null) playbackRaf = requestAnimationFrame(tickPlayback);
      };
      audio.onpause = () => {
        if (playbackRaf != null) cancelAnimationFrame(playbackRaf);
        playbackRaf = null;
      };
      audio.onended = () => {
        if (playbackRaf != null) cancelAnimationFrame(playbackRaf);
        playbackRaf = null;
        log("playback", "ended", sentence.id);
        dispatch(setPlayback({ sentenceId: null }));
        dispatch(setHighlight(null));
        if (!activeRef.current) dispatch(setStatus("idle"));
        else dispatch(setStatus("recording"));
      };
      audio.onerror = () => {
        if (playbackRaf != null) cancelAnimationFrame(playbackRaf);
        playbackRaf = null;
        log("playback", "audio error", { id: sentence.id, url: sentence.audioUrl });
        dispatch(setPlayback({ sentenceId: null }));
        dispatch(setHighlight(null));
        dispatch(setStatus(activeRef.current ? "recording" : "idle"));
        reportError("הקלטת השמע לא ניתנת להשמעה");
      };
      audio.play().catch((e) => {
        log("playback", "play error", e?.message);
        reportError(`Playback failed: ${e?.message ?? e}`, e);
      });
    },
    [dispatch, log, reportError, stopSpeechForPlayback],
  );

  const playTTSHighlighted = useCallback(
    async (sentence: Sentence) => {
      stopSpeechForPlayback();
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
    [dispatch, log, reportError, stopSpeechForPlayback],
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
