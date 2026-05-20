"use client";

import { useState } from "react";

export function CopyableValue({
  className,
  displayValue,
  href,
  value,
}: {
  className?: string;
  displayValue: string;
  href?: string;
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

  const label = failed ? "Failed" : copied ? "Copied" : "Copy";
  const valueElement = href ? (
    <a className="copyable-text" href={href} rel="noreferrer" target="_blank" title={value}>
      {displayValue}
    </a>
  ) : (
    <span className="copyable-text" title={value}>
      {displayValue}
    </span>
  );

  return (
    <span className={className ? `copyable-value ${className}` : "copyable-value"}>
      {valueElement}
      <button aria-label={`Copy ${value}`} className="copy-button" onClick={copyValue} type="button">
        {label}
      </button>
    </span>
  );
}
