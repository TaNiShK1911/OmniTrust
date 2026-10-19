/**
 * OmniTrust — CodeSnippet Component
 *
 * Syntax-highlighted code container with accessible one-click copy.
 */
import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeSnippetProps {
  code: string;
  language: string;
  title?: string;
}

export function CodeSnippet({ code, language, title }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/90 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase text-primary font-semibold">{language}</span>
          {title ? <span className="text-xs text-muted-foreground">· {title}</span> : null}
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-primary" />
              <span className="text-primary font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-foreground/90 bg-background/60">
        <code>{code}</code>
      </pre>
    </div>
  );
}
