"use client";

import * as React from "react";

interface ApiKeyContextValue {
  userKey: string;
  setUserKey: (key: string) => void;
  hasSharedKey: boolean;
}

const ApiKeyContext = React.createContext<ApiKeyContextValue | null>(null);

const STORAGE_KEY = "context_toolkit_gemini_key";

export function ApiKeyProvider({
  children,
  hasSharedKey,
}: {
  children: React.ReactNode;
  hasSharedKey: boolean;
}) {
  const [userKey, setUserKeyState] = React.useState("");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setUserKeyState(saved);
    } catch {}
    setHydrated(true);
  }, []);

  const setUserKey = React.useCallback((key: string) => {
    setUserKeyState(key);
    try {
      if (key) localStorage.setItem(STORAGE_KEY, key);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const value = React.useMemo(
    () => ({ userKey: hydrated ? userKey : "", setUserKey, hasSharedKey }),
    [userKey, setUserKey, hasSharedKey, hydrated]
  );

  return (
    <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const ctx = React.useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used inside ApiKeyProvider");
  return ctx;
}
