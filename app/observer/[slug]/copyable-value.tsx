"use client";

import { useState } from "react";

export function CopyableValue({
  className,
  displayValue,
  value,
}: {
  className?: string;
  displayValue: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copyValue() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  const status = failed ? "Copy failed" : copied ? "Copied" : value;

  return (
    <button
      aria-label={`Copy ${value}`}
      className={className ? `copyable-value ${className}` : "copyable-value"}
      onClick={copyValue}
      type="button"
    >
      <span className="copyable-text" title={value}>
        {displayValue}
      </span>
      <span className={copied || failed ? "copy-tooltip copy-tooltip-status" : "copy-tooltip"}>{status}</span>
    </button>
  );
}
