"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { initialState, STORAGE_KEY, type StoreState } from "../lib/store";

import { parseStoredState, serializeState } from "../lib/persist";

type StoreContextValue = {
  state: StoreState;
  ready: boolean;
  reset: () => void;
  update: (transform: (state: StoreState) => StoreState) => void;
  notify: (message: string) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => ({ ...initialState }));
  const [ready, setReady] = useState(false);
  const resetState = useRef<StoreState | null>(null);
  useEffect(() => {
    try {
      setState(parseStoredState(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      setState(initialState);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || state === resetState.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeState(state));
    } catch {}
  }, [ready, state]);
  const [notice, setNotice] = useState({ message: "", sequence: 0 });
  useEffect(() => {
    if (!notice.message) return;
    const timer = window.setTimeout(() => {
      setNotice((current) => current.sequence === notice.sequence ? { ...current, message: "" } : current);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  function notify(message: string) {
    setNotice((previous) => ({ message, sequence: previous.sequence + 1 }));
  }
  function reset() {
    const fresh = { ...initialState };
    resetState.current = fresh;
    setState(fresh);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    notify("Fresh start. Your demo has been reset.");
  }
  return (
    <StoreContext.Provider value={{ state, ready, reset, update: (transform) => setState(transform), notify }}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className={notice.message ? "notification" : "sr-only"}>
        <span key={notice.sequence}>{notice.message}</span>
      </div>
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore requires StoreProvider");
  return context;
}
