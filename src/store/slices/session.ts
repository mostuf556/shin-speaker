import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface SessionState {
  active: boolean;
  recording: boolean;
  interimText: string;
  playingSentenceId: string | null;
  playbackCurrentTime: number;
  highlight: { source: "playback" | "tts"; sentenceId: string; wordIndex: number } | null;
}

const initialState: SessionState = {
  active: false,
  recording: false,
  interimText: "",
  playingSentenceId: null,
  playbackCurrentTime: 0,
  highlight: null,
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
  },
});

export const {
  setActive,
  setRecording,
  setInterim,
  clearBoard,
  setPlayback,
  setHighlight,
} = slice.actions;
export default slice.reducer;
