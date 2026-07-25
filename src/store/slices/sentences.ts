import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface WordTiming {
  word: string;
  time: number; // seconds from start of recording
}

export interface Sentence {
  id: string;
  text: string;
  createdAt: number;
  audioUrl: string | null;
  durationMs: number;
  words: WordTiming[];
  containsShin: boolean;
}

interface SentencesState {
  items: Sentence[];
}

const initialState: SentencesState = { items: [] };

const slice = createSlice({
  name: "sentences",
  initialState,
  reducers: {
    addSentence(state, a: PayloadAction<Sentence>) {
      state.items.unshift(a.payload);
    },
    clearAll(state) {
      state.items = [];
    },
  },
});

export const { addSentence, clearAll } = slice.actions;
export default slice.reducer;
