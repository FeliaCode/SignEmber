"use client";
import { useState } from "react";

export const CA = "EX292H3kp4iEDjN9sLTUEt5oYPsDPZAejsNmo3Qbpump";

/** The coin's contract address, shortened, with tap-to-copy. */
export function Ca({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(CA);
        } catch {
          /* clipboard blocked: the full address is in the title */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={CA}
      aria-label={`Copy contract address ${CA}`}
      className={`inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 font-mono text-mini transition-smooth hover:bg-secondary ${className}`}
    >
      <span className="text-muted-foreground">CA</span>
      <span>{copied ? "Copied" : `${CA.slice(0, 4)}…${CA.slice(-4)}`}</span>
      <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
    </button>
  );
}
