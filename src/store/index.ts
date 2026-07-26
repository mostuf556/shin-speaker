import { configureStore, Middleware } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import sessionReducer from "./slices/session";
import sentencesReducer from "./slices/sentences";
import settingsReducer from "./slices/settings";
import logReducer, { appendLog } from "./slices/log";

const loggingMiddleware: Middleware = (store) => (next) => (action: any) => {
  const result = next(action);
  if (action?.type && !action.type.startsWith("log/") && action.type !== "session/setMicLevel") {
    store.dispatch(
      appendLog({
        tag: "redux",
        message: action.type,
        data: action.payload !== undefined ? safeSerialize(action.payload) : undefined,
      }),
    );
  }
  return result;
};

function safeSerialize(v: any): string | undefined {
  try {
    const s = JSON.stringify(v);
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return String(v);
  }
}

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    sentences: sentencesReducer,
    settings: settingsReducer,
    log: logReducer,
  },
  middleware: (getDefault) =>
    getDefault({ serializableCheck: false }).concat(loggingMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
