import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ActionType = "playback" | "word-tts" | "sentence-tts";
export type TTSEngine = "native" | "api";
export type HistoryView = "expanded" | "shrinked" | "hidden";

interface SettingsState {
  leadInMs: number;
  actions: ActionType[];
  ttsEngine: TTSEngine;
  boardClearTimeoutMs: number;
  restartDelayMs: number;
  historyView: HistoryView;
  sstLang: string;
  ttsLang: string;
}

const initialState: SettingsState = {
  leadInMs: 200,
  actions: ["playback", "word-tts", "sentence-tts"],
  ttsEngine: "api",
  boardClearTimeoutMs: 1000,
  restartDelayMs: 1500,
  historyView: "expanded",
  sstLang: "he-IL",
  ttsLang: "he-IL",
};

const slice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setLeadInMs(state, a: PayloadAction<number>) {
      state.leadInMs = a.payload;
    },
    toggleAction(state, a: PayloadAction<ActionType>) {
      const i = state.actions.indexOf(a.payload);
      if (i >= 0) state.actions.splice(i, 1);
      else state.actions.push(a.payload);
    },
    setActions(state, a: PayloadAction<ActionType[]>) {
      state.actions = a.payload;
    },
    setTTSEngine(state, a: PayloadAction<TTSEngine>) {
      state.ttsEngine = a.payload;
    },
    setBoardClearTimeoutMs(state, a: PayloadAction<number>) {
      state.boardClearTimeoutMs = a.payload;
    },
    setRestartDelayMs(state, a: PayloadAction<number>) {
      state.restartDelayMs = a.payload;
    },
    setHistoryView(state, a: PayloadAction<HistoryView>) {
      state.historyView = a.payload;
    },
    cycleHistoryView(state) {
      state.historyView =
        state.historyView === "expanded"
          ? "shrinked"
          : state.historyView === "shrinked"
            ? "hidden"
            : "expanded";
    },
  },
});

export const {
  setLeadInMs,
  toggleAction,
  setActions,
  setTTSEngine,
  setBoardClearTimeoutMs,
  setRestartDelayMs,
  setHistoryView,
  cycleHistoryView,
} = slice.actions;
export default slice.reducer;
