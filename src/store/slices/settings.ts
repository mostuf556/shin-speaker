import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ActionType = "playback" | "word-tts" | "sentence-tts";

interface SettingsState {
  leadInMs: number;
  actions: ActionType[];
}

const initialState: SettingsState = {
  leadInMs: 200,
  actions: ["playback", "word-tts", "sentence-tts"],
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
  },
});

export const { setLeadInMs, toggleAction, setActions } = slice.actions;
export default slice.reducer;
