"use client";

import * as React from "react";

export default function TestPage() {
  const [count, setCount] = React.useState(0);
  const [showModal, setShowModal] = React.useState(false);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">React State Test</h1>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          If React works on this device, the count below should change when you
          tap.
        </p>
        <button
          onClick={() => setCount((c) => c + 1)}
          className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-lg active:scale-95"
        >
          Tap count: {count}
        </button>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          If conditional rendering works, tapping should show a red box below.
        </p>
        <button
          onClick={() => setShowModal((v) => !v)}
          className="px-6 py-3 rounded-lg bg-secondary text-secondary-foreground font-bold text-lg active:scale-95"
        >
          {showModal ? "Hide red box" : "Show red box"}
        </button>
        {showModal && (
          <div className="p-8 rounded-lg bg-red-500 text-white font-bold text-xl">
            CONDITIONAL RENDER WORKS — visible red box.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          User-Agent (so we know what browser is loading):
        </p>
        <code className="block text-xs bg-muted p-3 rounded break-all">
          {typeof navigator !== "undefined" ? navigator.userAgent : "SSR"}
        </code>
      </div>

      <div className="text-xs text-muted-foreground border-t border-border pt-4">
        Build version: <code className="font-mono">v5-debug</code>
      </div>
    </div>
  );
}
