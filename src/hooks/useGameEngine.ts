import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  clearBoard,
  setHighlight,
  setInterim,
  setPlayback,
  setRecording,
  setActive,
} from "@/store/slices/session";
import { addSentence, Sentence, WordTiming } from "@/store/slices/sentences";
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

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const wordsRef = useRef<WordTiming[]>([]);
  const knownWordsRef = useRef<string[]>([]);
  const loopingRef = useRef(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const ttsPlaybackRef = useRef<HTMLAudioElement | null>(null);

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
    dispatch(setRecording(false));
    log("recorder", "stopRecording");
  }, [dispatch, log]);

  const runActionsFor = useCallback(
    async (sentence: Sentence) => {
      const acts = settingsRef.current.actions;
      log("action", "running actions", acts);
      for (const act of acts) {
        if (act === "playback" && sentence.audioUrl) {
          await new Promise<void>((resolve) => {
            const audio = new Audio(sentence.audioUrl!);
            ttsPlaybackRef.current = audio;
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            log("playback", "action playback start");
            audio.play().catch(() => resolve());
          });
        } else if (act === "word-tts") {
          // find first ש-word
          const shWord = sentence.words.find((w) => w.word.includes("ש"));
          if (shWord) {
            log("tts", "word-tts", shWord.word);
            await playTTS(shWord.word);
          }
        } else if (act === "sentence-tts") {
          log("tts", "sentence-tts", sentence.text);
          await playTTS(sentence.text);
        }
      }
    },
    [log],
  );

  async function playTTS(text: string) {
    try {
      const res = await generateTTS({ data: { text, voice: "alloy" } });
      const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
      ttsPlaybackRef.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch (e: any) {
      console.error(e);
    }
  }

  const startIteration = useCallback(async () => {
    if (!loopingRef.current) return;
    dispatch(clearBoard());
    log("session", "iteration start");

    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      log("sst", "SpeechRecognition unsupported");
      dispatch(setActive(false));
      loopingRef.current = false;
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: any) {
      log("recorder", "mic denied", e?.message);
      dispatch(setActive(false));
      loopingRef.current = false;
      return;
    }
    streamRef.current = stream;

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
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      const url = URL.createObjectURL(blob);
      log("recorder", "stopped", { durationMs, size: blob.size });
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

      // update per-word timings
      const currentWords = extractWords(combined);
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      for (let i = knownWordsRef.current.length; i < currentWords.length; i++) {
        wordsRef.current.push({ word: currentWords[i], time: elapsed });
      }
      knownWordsRef.current = currentWords;
      if (finalPart) log("sst", "final", finalPart);

      if (finalPart) {
        finalTextThisRun += finalPart;
        // finalize
        finalizeSentence(finalTextThisRun.trim());
      }
    };

    recognition.onerror = (e: any) => {
      log("sst", "error", e?.error || String(e));
    };
    recognition.onend = () => {
      log("sst", "end");
    };

    const finalizeSentence = (text: string) => {
      if (!loopingRef.current) return;
      loopingRef.current = false; // temporarily; will resume after actions
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

        (async () => {
          if (containsShin) {
            await runActionsFor(sentence);
          }
          // loop again
          loopingRef.current = true;
          dispatch(setRecording(false));
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
    log("recorder", "started");
    log("sst", "started");
  }, [dispatch, log, runActionsFor]);

  const start = useCallback(() => {
    if (loopingRef.current) return;
    loopingRef.current = true;
    dispatch(setActive(true));
    log("session", "start");
    startIteration();
  }, [dispatch, log, startIteration]);

  const stop = useCallback(() => {
    loopingRef.current = false;
    dispatch(setActive(false));
    stopRecording();
    log("session", "stop");
  }, [dispatch, log, stopRecording]);

  const playSentence = useCallback(
    (sentenceId: string, fromTime = 0) => {
      const s = (window as any).__store_state__?.().sentences.items.find(
        (x: Sentence) => x.id === sentenceId,
      );
      // fallback via dispatch selector is done from component; keep simple
      return { s, fromTime };
    },
    [],
  );

  // Playback helper exposed for components
  const playRecording = useCallback(
    (sentence: Sentence, fromTime: number = 0) => {
      if (!sentence.audioUrl) return;
      // stop existing
      audioElementRef.current?.pause();
      const audio = new Audio(sentence.audioUrl);
      audioElementRef.current = audio;
      audio.currentTime = Math.max(0, fromTime);
      dispatch(setPlayback({ sentenceId: sentence.id, currentTime: fromTime }));
      log("playback", "start", { id: sentence.id, fromTime });

      audio.ontimeupdate = () => {
        const t = audio.currentTime;
        dispatch(setPlayback({ sentenceId: sentence.id, currentTime: t }));
        // find current word
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
      };
      audio.play().catch((e) => log("playback", "play error", e?.message));
    },
    [dispatch, log],
  );

  const playTTSHighlighted = useCallback(
    async (sentence: Sentence) => {
      log("tts", "start", sentence.text);
      try {
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
              setHighlight({ source: "tts", sentenceId: sentence.id, wordIndex: idx }),
            );
          };
        };
        audio.onended = () => {
          dispatch(setHighlight(null));
          log("tts", "ended");
        };
        await audio.play();
      } catch (e: any) {
        log("tts", "error", e?.message);
      }
    },
    [dispatch, log],
  );

  useEffect(() => {
    return () => {
      loopingRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { start, stop, playRecording, playTTSHighlighted, playSentence };
}
