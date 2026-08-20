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
