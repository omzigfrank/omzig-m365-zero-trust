import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { PowerShellBlock } from "@/components/audit/PowerShellBlock";

afterEach(() => {
  cleanup();
});

describe("PowerShellBlock", () => {
  it("renders code in a pre/code block", () => {
    render(<PowerShellBlock code="Get-MgUser -All" />);

    const pre = screen.getByRole("generic", { hidden: true }).querySelector?.("pre") ??
      document.querySelector("pre");
    expect(pre).toBeDefined();
    expect(pre!.textContent).toContain("Get-MgUser");
  });

  it("copy button calls navigator.clipboard.writeText with the code", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    const code = 'Connect-MgGraph -Scopes "Policy.ReadWrite"';
    render(<PowerShellBlock code={code} />);

    const copyButton = screen.getByLabelText("Copy to clipboard");
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(code);
    });
  });

  it("button shows check icon after copy", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<PowerShellBlock code="Get-MgUser" />);

    const copyButton = screen.getByLabelText("Copy to clipboard");
    fireEvent.click(copyButton);

    // After copy, the check icon should appear (green color class)
    await waitFor(() => {
      const svg = copyButton.querySelector("svg");
      // Check icon has text-green-400 class
      expect(svg?.classList.toString()).toContain("text-green-400");
    });
  });
});
