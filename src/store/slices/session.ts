import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type AppStatus =
  | "idle"
  | "recording"
  | "tts-word"
  | "tts-sentence"
  | "playback-in-game"
  | "playback-out-of-game"
  | "error";

export interface AppError {
  message: string;
  stack?: string;
}

interface SessionState {
  active: boolean;
  recording: boolean;
  interimText: string;
  playingSentenceId: string | null;
  playbackCurrentTime: number;
  highlight: { source: "playback" | "tts"; sentenceId: string; wordIndex: number } | null;
  status: AppStatus;
  micLevel: number; // 0..1
  error: AppError | null;
}

const initialState: SessionState = {
  active: false,
  recording: false,
  interimText: "",
  playingSentenceId: null,
  playbackCurrentTime: 0,
  highlight: null,
  status: "idle",
  micLevel: 0,
  error: null,
};

const slice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setActive(state, a: PayloadAction<boolean>) {
      state.active = a.payload;
    },
    setRecording(state, a: PayloadAction<boolean>) {
      state.recording = a.payload;
    },
    setInterim(state, a: PayloadAction<string>) {
      state.interimText = a.payload;
    },
    clearBoard(state) {
      state.interimText = "";
    },
    setPlayback(
      state,
      a: PayloadAction<{ sentenceId: string | null; currentTime?: number }>,
    ) {
      state.playingSentenceId = a.payload.sentenceId;
      state.playbackCurrentTime = a.payload.currentTime ?? 0;
    },
    setHighlight(
      state,
      a: PayloadAction<
        { source: "playback" | "tts"; sentenceId: string; wordIndex: number } | null
      >,
    ) {
      state.highlight = a.payload;
    },
    setStatus(state, a: PayloadAction<AppStatus>) {
      state.status = a.payload;
    },
    setMicLevel(state, a: PayloadAction<number>) {
      state.micLevel = a.payload;
    },
    setError(state, a: PayloadAction<AppError | null>) {
      state.error = a.payload;
      if (a.payload) state.status = "error";
    },
    clearError(state) {
      state.error = null;
      if (state.status === "error") state.status = "idle";
    },
  },
});

export const {
  setActive,
  setRecording,
  setInterim,
  clearBoard,
  setPlayback,
  setHighlight,
  setStatus,
  setMicLevel,
  setError,
  clearError,
} = slice.actions;
export default slice.reducer;
