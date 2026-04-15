import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock the signalr client module (not actually used in these tests —
// we rely on polling fallback when negotiate fetch returns ok:false).
vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    build() {
      return {
        state: "Disconnected",
        on: vi.fn(),
        onclose: vi.fn(),
        start: vi.fn().mockRejectedValue(new Error("no signalr in tests")),
        stop: vi.fn().mockResolvedValue(undefined),
      };
    }
  }
  return {
    HubConnectionBuilder,
    HubConnectionState: { Disconnected: "Disconnected" },
  };
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import {
  useRemediation,
  ConsentRequiredError,
} from "@/hooks/useRemediation";

describe("useRemediation", () => {
  it("triggerRemediation POSTs to /approve and transitions to running", async () => {
    // First call: POST /approve -> 202 with jobId
    // Second call: GET /signalr/negotiate (fails -> polling fallback)
    // Third call: GET /:jobId (poll)
    fetchMock.mockImplementation((url: string, init?: any) => {
      if (url.endsWith("/remediations/approve") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 202,
          json: async () => ({
            data: { remediationJobId: "job-1", status: "pending" },
          }),
        });
      }
      if (url.includes("/signalr/negotiate")) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      // Poll fetch for the job detail
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: { id: "job-1", status: "running", controlId: "MS.AAD.1.1v1" },
        }),
      });
    });

    const { result } = renderHook(() => useRemediation("tenant-1"));

    await act(async () => {
      await result.current.triggerRemediation({
        findingId: "f1",
        bundle: "conditionalAccess",
      });
    });

    expect(result.current.status).toBe("running");
  });

  it("triggerRemediation throws ConsentRequiredError on 400 consent_required", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: "CONSENT_REQUIRED" } }),
    });

    const { result } = renderHook(() => useRemediation("tenant-1"));

    await expect(
      result.current.triggerRemediation({
        findingId: "f1",
        bundle: "conditionalAccess",
      }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("triggerRemediation throws when API returns non-400 failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "server exploded" } }),
    });

    const { result } = renderHook(() => useRemediation("tenant-1"));

    await expect(
      result.current.triggerRemediation({
        findingId: "f1",
        bundle: "conditionalAccess",
      }),
    ).rejects.toThrow(/server exploded/);
  });

  it("rollbackRemediation surfaces drift with changedFields on 409", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          message: "drift",
          changedFields: ["state", "grantControls"],
        },
      }),
    });

    const { result } = renderHook(() => useRemediation("tenant-1"));

    try {
      await result.current.rollbackRemediation("job-1", false);
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as Error & { changedFields?: string[] };
      expect(e.changedFields).toEqual(["state", "grantControls"]);
    }
  });

  it("reset clears state to idle", () => {
    const { result } = renderHook(() => useRemediation("tenant-1"));
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.currentJob).toBeNull();
  });
});
