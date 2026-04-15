"use client";

/**
 * useRemediation -- Phase 7 Plan 02.
 *
 * Hook for triggering, subscribing to, and rolling back a remediation job.
 * Mirrors the useAudit hook pattern: SignalR primary + polling fallback.
 *
 * The hook does NOT own the consent flow -- callers should call
 * useIncrementalConsent.ensureConsent(bundle) first. If the POST /approve
 * returns a CONSENT_REQUIRED error, the caller should invoke the consent
 * flow and retry.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HubConnectionBuilder,
  HubConnectionState,
  type HubConnection,
} from '@microsoft/signalr';
import type { ScopeBundleName } from '@/services/remediation-consent';

const POLL_INTERVAL_MS = 3000;

export type RemediationStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'rollback_failed'
  | 'rollback_partial';

export interface RemediationProgressUpdate {
  type:
    | 'remediation_started'
    | 'remediation_progress'
    | 'remediation_completed'
    | 'remediation_failed'
    | 'remediation_rolled_back';
  remediationJobId: string;
  tenantId: string;
  controlId: string;
  classification: 'SAFE' | 'RISKY';
  status: string;
  message?: string;
  error?: string;
}

export interface RemediationJobView {
  id: string;
  status: RemediationStatus | string;
  controlId: string;
  classification: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  lastAttemptError?: string | null;
}

export interface TriggerOptions {
  findingId: string;
  // bundle is informational -- the server resolves it from the control registry.
  bundle: ScopeBundleName;
}

export class ConsentRequiredError extends Error {
  readonly code = 'CONSENT_REQUIRED';
  constructor(public readonly bundle: ScopeBundleName) {
    super(`Consent required for bundle ${bundle}`);
    this.name = 'ConsentRequiredError';
  }
}

async function negotiateSignalR(): Promise<{
  url: string;
  accessToken: string;
}> {
  const res = await fetch('/api/signalr/negotiate');
  if (!res.ok) throw new Error('signalr negotiate failed');
  const body = (await res.json()) as {
    data: { url: string; accessToken: string };
  };
  return body.data;
}

export function useRemediation(tenantId: string) {
  const [status, setStatus] = useState<RemediationStatus>('idle');
  const [currentJob, setCurrentJob] = useState<RemediationJobView | null>(null);
  const [progress, setProgress] =
    useState<RemediationProgressUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectionRef = useRef<HubConnection | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentJobIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopSignalR = useCallback(() => {
    const conn = connectionRef.current;
    if (conn && conn.state !== HubConnectionState.Disconnected) {
      conn.stop().catch(() => {});
    }
    connectionRef.current = null;
  }, []);

  const fetchJob = useCallback(
    async (jobId: string): Promise<RemediationJobView | null> => {
      const res = await fetch(
        `/api/tenants/${tenantId}/remediations/${jobId}`,
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { data: RemediationJobView };
      return body.data;
    },
    [tenantId],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        const job = await fetchJob(jobId);
        if (!job) return;
        setCurrentJob(job);
        const s = job.status as RemediationStatus;
        if (
          s === 'completed' ||
          s === 'failed' ||
          s === 'rolled_back' ||
          s === 'rollback_failed' ||
          s === 'rollback_partial'
        ) {
          setStatus(s);
          stopPolling();
          stopSignalR();
        }
      }, POLL_INTERVAL_MS);
    },
    [fetchJob, stopPolling, stopSignalR],
  );

  const connectSignalR = useCallback(
    async (jobId: string) => {
      try {
        const { url, accessToken } = await negotiateSignalR();
        const connection = new HubConnectionBuilder()
          .withUrl(url, { accessTokenFactory: () => accessToken })
          .withAutomaticReconnect()
          .build();

        connection.on(
          'remediationProgress',
          (msg: RemediationProgressUpdate) => {
            if (msg.remediationJobId !== currentJobIdRef.current) return;
            setProgress(msg);
            if (msg.type === 'remediation_completed') {
              setStatus('completed');
              fetchJob(jobId).then((j) => j && setCurrentJob(j));
              stopSignalR();
              stopPolling();
            } else if (msg.type === 'remediation_failed') {
              setStatus('failed');
              setError(msg.error ?? 'Remediation failed');
              stopSignalR();
              stopPolling();
            } else if (msg.type === 'remediation_rolled_back') {
              setStatus('rolled_back');
              stopSignalR();
              stopPolling();
            }
          },
        );

        connection.onclose(() => {
          // Fall back to polling
          startPolling(jobId);
        });

        await connection.start();
        connectionRef.current = connection;
      } catch {
        // SignalR not available -- poll-only fallback
        startPolling(jobId);
      }
    },
    [fetchJob, startPolling, stopPolling, stopSignalR],
  );

  const triggerRemediation = useCallback(
    async ({ findingId, bundle }: TriggerOptions) => {
      setStatus('pending');
      setError(null);
      setProgress(null);

      const res = await fetch(
        `/api/tenants/${tenantId}/remediations/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ findingId }),
        },
      );

      if (res.status === 400) {
        const body = (await res.json()) as { error?: { code?: string } };
        if (body?.error?.code === 'CONSENT_REQUIRED') {
          setStatus('idle');
          throw new ConsentRequiredError(bundle);
        }
      }

      if (!res.ok) {
        const body = (await res.json()) as {
          error?: { message?: string; code?: string };
        };
        const message = body.error?.message ?? `Approve failed (${res.status})`;
        setStatus('failed');
        setError(message);
        throw new Error(message);
      }

      const body = (await res.json()) as {
        data: { remediationJobId: string; status: string };
      };
      currentJobIdRef.current = body.data.remediationJobId;
      setStatus('running');
      startPolling(body.data.remediationJobId);
      connectSignalR(body.data.remediationJobId);
      return body.data;
    },
    [tenantId, startPolling, connectSignalR],
  );

  const rollbackRemediation = useCallback(
    async (jobId: string, confirmed = false) => {
      const res = await fetch(
        `/api/tenants/${tenantId}/remediations/${jobId}/rollback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed }),
        },
      );
      if (res.status === 409) {
        const body = (await res.json()) as {
          error?: { changedFields?: string[]; message?: string };
        };
        const changed = body.error?.changedFields ?? [];
        const err = new Error(body.error?.message ?? 'Drift detected');
        (err as Error & { changedFields?: string[] }).changedFields = changed;
        throw err;
      }
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Rollback failed (${res.status})`);
      }
      setStatus('rolled_back');
      const fresh = await fetchJob(jobId);
      if (fresh) setCurrentJob(fresh);
    },
    [tenantId, fetchJob],
  );

  const reset = useCallback(() => {
    stopPolling();
    stopSignalR();
    currentJobIdRef.current = null;
    setStatus('idle');
    setCurrentJob(null);
    setProgress(null);
    setError(null);
  }, [stopPolling, stopSignalR]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      stopSignalR();
    };
  }, [stopPolling, stopSignalR]);

  return {
    status,
    currentJob,
    progress,
    error,
    triggerRemediation,
    rollbackRemediation,
    reset,
  };
}
