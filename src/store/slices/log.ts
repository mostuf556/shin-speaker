import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type LogTag =
  | "sst"
  | "sentence"
  | "action"
  | "playback"
  | "tts"
  | "trim"
  | "session"
  | "recorder"
  | "redux"
  | "error"
  | "status";

export interface LogEntry {
  id: string;
  time: number;
  tag: LogTag;
  message: string;
  data?: string;
  count: number;
}

interface LogState {
  entries: LogEntry[];
}

const initialState: LogState = { entries: [] };

const slice = createSlice({
  name: "log",
  initialState,
  reducers: {
    appendLog: {
      reducer(state, action: PayloadAction<LogEntry>) {
        const last = state.entries[state.entries.length - 1];
        if (
          last &&
          last.tag === action.payload.tag &&
          last.message === action.payload.message &&
          last.data === action.payload.data
        ) {
          // Dedup: bump count + refresh time instead of pushing duplicate row.
          last.count += 1;
          last.time = action.payload.time;
          return;
        }
        state.entries.push(action.payload);
        if (state.entries.length > 500)
          state.entries.splice(0, state.entries.length - 500);
      },
      prepare(input: { tag: LogTag; message: string; data?: string }) {
        return {
          payload: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            time: Date.now(),
            tag: input.tag,
            message: input.message,
            data: input.data,
            count: 1,
          } as LogEntry,
        };
      },
    },
    clearLog(state) {
      state.entries = [];
    },
  },
});

export const { appendLog, clearLog } = slice.actions;
export default slice.reducer;
