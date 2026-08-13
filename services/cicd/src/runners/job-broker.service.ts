import { Injectable } from '@nestjs/common';

export interface JobResult {
  status: 'succeeded' | 'failed';
  log: string;
  exitCode: number;
}

/**
 * In-memory pause/resume point shared between the pipeline executor
 * (RunnerService, running a `runsOn:`-tagged step) and the runner-facing
 * jobs API (RunnersService.completeJob, called by an external agent) —
 * the same "block on a promise stashed in a map, resolved by an
 * unrelated later HTTP request" shape RunnerService already uses for
 * manual approval gates, just with an external agent process on the
 * resolving end instead of a human clicking Approve/Reject. Pulled into
 * its own injectable specifically so RunnerService and RunnersService
 * don't need a circular dependency on each other to share it.
 */
@Injectable()
export class JobBrokerService {
  private readonly pending = new Map<string, (result: JobResult) => void>();

  // The triggering request's bearer token, needed by the claiming agent to
  // clone the repo from git-host itself, held in memory only and handed
  // out exactly once (see stashAuthHeader/takeAuthHeader) — never written
  // to runner_jobs or any other persisted row.
  private readonly authHeaders = new Map<string, string>();

  waitFor(jobId: string): Promise<JobResult> {
    return new Promise((resolve) => {
      this.pending.set(jobId, resolve);
    });
  }

  resolve(jobId: string, result: JobResult): boolean {
    const resolve = this.pending.get(jobId);
    if (!resolve) return false;
    this.pending.delete(jobId);
    resolve(result);
    return true;
  }

  hasPending(jobId: string): boolean {
    return this.pending.has(jobId);
  }

  stashAuthHeader(jobId: string, authorizationHeader: string): void {
    this.authHeaders.set(jobId, authorizationHeader);
  }

  /** Single-use — the first claim to read it consumes it, so a second
   *  claim attempt on the same job (which shouldn't happen given the
   *  `for update skip locked` claim query, but this is a second
   *  independent safeguard) gets nothing rather than a stale credential. */
  takeAuthHeader(jobId: string): string | undefined {
    const header = this.authHeaders.get(jobId);
    this.authHeaders.delete(jobId);
    return header;
  }
}
