"use client";

// TEMPORARY diagnostic page for the streaming investigation. Replicates the
// exact reader loop from ChatClient.send() against /api/stream-test and logs
// each chunk's arrival time. Delete after the investigation.

import { useState } from "react";

export default function StreamTestPage() {
  const [log, setLog] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setText("");
    setLog([]);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/stream-test", { method: "POST" });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const at = Math.round(performance.now() - t0);
        setLog((l) => [...l, `${at}ms  ${JSON.stringify(chunk)}`]);
        setText((t) => t + chunk);
      }
      setLog((l) => [...l, `${Math.round(performance.now() - t0)}ms  [done]`]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="rounded-full bg-c-accent px-5 py-2 text-sm font-semibold text-c-on-accent disabled:opacity-40"
      >
        Run stream test
      </button>
      <p data-testid="streamed-text" className="mt-4 min-h-6 text-c-ink">
        {text}
      </p>
      <ol data-testid="chunk-log" className="mt-4 space-y-0.5 text-xs text-c-muted">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </main>
  );
}
