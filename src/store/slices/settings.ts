import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ActionType = "playback" | "word-tts" | "sentence-tts";
export type TTSEngine = "native" | "api";
export type SSTEngine = "native";
export type SSTMode = "single" | "continuous";
export type MainStageMode = "latest" | "stacked";
export type HistoryView = "expanded" | "shrinked" | "hidden";

interface SettingsState {
  leadInMs: number;
  actions: ActionType[];
  ttsEngine: TTSEngine;
  sstEngine: SSTEngine;
  sstMode: SSTMode;
  autoRestartSST: boolean;
  boardClearTimeoutMs: number;
  restartDelayMs: number;
  historyView: HistoryView;
  showInterim: boolean;
  showMainInterim: boolean;
  showMainFinal: boolean;
  showMainMic: boolean;
  mainStageMode: MainStageMode;
  recordAudio: boolean;
  sstLang: string;
  ttsLang: string;
}

const initialState: SettingsState = {
  leadInMs: 200,
  actions: ["playback", "word-tts", "sentence-tts"],
  ttsEngine: "api",
  sstEngine: "native",
  sstMode: "continuous",
  autoRestartSST: true,
  boardClearTimeoutMs: 1000,
  restartDelayMs: 1500,
  historyView: "expanded",
  showInterim: true,
  showMainInterim: true,
  showMainFinal: true,
  showMainMic: false,
  mainStageMode: "latest",
  recordAudio: false,
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
    toggleShowInterim(state) {
      state.showInterim = !state.showInterim;
    },
    toggleShowMainInterim(state) {
      state.showMainInterim = !state.showMainInterim;
    },
    toggleShowMainFinal(state) {
      state.showMainFinal = !state.showMainFinal;
    },
    toggleShowMainMic(state) {
      state.showMainMic = !state.showMainMic;
    },
    setMainStageMode(state, a: PayloadAction<MainStageMode>) {
      state.mainStageMode = a.payload;
    },
    setSSTMode(state, a: PayloadAction<SSTMode>) {
      state.sstMode = a.payload;
    },
    toggleAutoRestartSST(state) {
      state.autoRestartSST = !state.autoRestartSST;
    },
    toggleRecordAudio(state) {
      state.recordAudio = !state.recordAudio;
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
  toggleShowInterim,
  toggleShowMainInterim,
  toggleShowMainFinal,
  toggleShowMainMic,
  setMainStageMode,
  setSSTMode,
  toggleAutoRestartSST,
  toggleRecordAudio,
} = slice.actions;
export default slice.reducer;
