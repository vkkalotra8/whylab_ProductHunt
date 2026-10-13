import crypto from 'node:crypto';
import type {
  InvestigationJob,
  InvestigationJobData,
  JobStatus,
  QueueStats,
} from './types.ts';

export class InvestigationQueue {
  private readonly jobs = new Map<string, InvestigationJob>();
  private readonly waitingQueue: string[] = [];
  private readonly activeAbortControllers = new Map<string, AbortController>();

  async enqueue(
    jobData: Omit<InvestigationJobData, 'jobId' | 'createdAt'>
  ): Promise<InvestigationJob> {
    const jobId = `job_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const fullData: InvestigationJobData = {
      ...jobData,
      jobId,
      createdAt: now,
    };

    const job: InvestigationJob = {
      id: jobId,
      data: fullData,
      status: 'queued',
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
    };

    this.jobs.set(jobId, job);
    this.waitingQueue.push(jobId);
    return job;
  }

  async getJob(jobId: string): Promise<InvestigationJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async getJobByInvestigationId(investigationId: string): Promise<InvestigationJob | null> {
    for (const job of this.jobs.values()) {
      if (job.data.investigationId === investigationId) {
        return job;
      }
    }
    return null;
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    updates?: Partial<Omit<InvestigationJob, 'id' | 'data' | 'status'>>
  ): Promise<InvestigationJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.status = status;
    if (updates) {
      Object.assign(job, updates);
    }

    if (status === 'running' && !job.startedAt) {
      job.startedAt = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      job.completedAt = new Date().toISOString();
      this.activeAbortControllers.delete(jobId);
    }

    this.jobs.set(jobId, job);
    return job;
  }

  registerAbortController(jobId: string, controller: AbortController): void {
    this.activeAbortControllers.set(jobId, controller);
  }

  async cancelJob(jobId: string, reason: string = 'User requested cancellation'): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return false; // Already in terminal state
    }

    // If currently running, abort execution
    const controller = this.activeAbortControllers.get(jobId);
    if (controller) {
      controller.abort(reason);
      this.activeAbortControllers.delete(jobId);
    }

    // Remove from waiting queue if pending
    const queueIdx = this.waitingQueue.indexOf(jobId);
    if (queueIdx !== -1) {
      this.waitingQueue.splice(queueIdx, 1);
    }

    job.status = 'cancelled';
    job.error = reason;
    job.completedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    return true;
  }

  async getNextJob(): Promise<InvestigationJob | null> {
    while (this.waitingQueue.length > 0) {
      const nextId = this.waitingQueue.shift()!;
      const job = this.jobs.get(nextId);
      if (job && job.status === 'queued') {
        return job;
      }
    }
    return null;
  }

  async reEnqueue(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.status = 'queued';
    this.waitingQueue.push(jobId);
    return true;
  }

  async getStats(): Promise<QueueStats> {
    let waiting = 0,
      active = 0,
      completed = 0,
      failed = 0,
      cancelled = 0;

    for (const j of this.jobs.values()) {
      if (j.status === 'queued') waiting++;
      else if (j.status === 'running') active++;
      else if (j.status === 'completed') completed++;
      else if (j.status === 'failed') failed++;
      else if (j.status === 'cancelled') cancelled++;
    }

    return { waiting, active, completed, failed, cancelled };
  }

  async listJobs(organizationId: string, projectId?: string): Promise<InvestigationJob[]> {
    const list: InvestigationJob[] = [];
    for (const j of this.jobs.values()) {
      if (j.data.organizationId === organizationId) {
        if (!projectId || j.data.projectId === projectId) {
          list.push(j);
        }
      }
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  resetForTesting(): void {
    for (const ctrl of this.activeAbortControllers.values()) {
      ctrl.abort('Test reset');
    }
    this.activeAbortControllers.clear();
    this.jobs.clear();
    this.waitingQueue.length = 0;
  }
}

// Global queue instance
let globalQueue: InvestigationQueue | null = null;

export function getInvestigationQueue(): InvestigationQueue {
  if (!globalQueue) {
    globalQueue = new InvestigationQueue();
  }
  return globalQueue;
}

export function setInvestigationQueueForTest(q: InvestigationQueue | null): void {
  globalQueue = q;
}
