"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { initialState, type StoreState } from "../lib/store";

type StoreContextValue = {
  state: StoreState;
  update: (transform: (state: StoreState) => StoreState) => void;
  notify: (message: string) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => ({ ...initialState }));
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
  return (
    <StoreContext.Provider value={{ state, update: (transform) => setState(transform), notify }}>
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
