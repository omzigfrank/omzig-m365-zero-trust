"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const PS_COMMENTS = /(#.*$)/gm;
const PS_STRINGS = /('[^']*'|"[^"]*")/g;
const PS_KEYWORDS =
  /\b(Connect-MgGraph|Get-Mg\w+|Set-Mg\w+|New-Mg\w+|Update-Mg\w+|Invoke-MgGraphRequest|Get-MgBeta\w+)\b/g;
const PS_PARAMS = /\s(-\w+)/g;

/**
 * Apply CSS-class-based syntax highlighting to PowerShell code.
 * Order matters: comments first (to avoid highlighting inside comments),
 * then strings, then keywords, then parameters.
 */
function highlightPS(code: string): string {
  // HTML-escape first
  let result = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Replace comments
  result = result.replace(
    PS_COMMENTS,
    '<span class="text-gray-500 italic">$1</span>'
  );

  // Replace strings
  result = result.replace(
    PS_STRINGS,
    '<span class="text-amber-600">$1</span>'
  );

  // Replace keywords (Graph API cmdlets)
  result = result.replace(
    PS_KEYWORDS,
    '<span class="text-blue-600 font-semibold">$1</span>'
  );

  // Replace parameters
  result = result.replace(
    PS_PARAMS,
    ' <span class="text-cyan-600">$1</span>'
  );

  return result;
}

export function PowerShellBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg bg-gray-900 p-4">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
      <pre className="overflow-x-auto text-sm leading-relaxed text-gray-100">
        <code dangerouslySetInnerHTML={{ __html: highlightPS(code) }} />
      </pre>
    </div>
  );
}
