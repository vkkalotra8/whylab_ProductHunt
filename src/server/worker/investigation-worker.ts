import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../core/diagnostics/evaluation-ingestion.ts';
import { runAutonomousInvestigation } from '../orchestrator/investigator.ts';
import { resolveInvestigatorProvider } from '../orchestrator/provider-factory.ts';
import { createId } from '../../core/domain/primitives.ts';
import { saveInvestigationCsv, saveInvestigationArtifacts, saveInvestigation } from '../../core/investigation/store.ts';
import { sanitizeFileName, sanitizeInputText } from '../security/sanitizer.ts';
import { getInvestigationQueue, type InvestigationQueue } from '../queue/investigation-queue.ts';
import { getEventHub, type InvestigationEventHub } from '../queue/event-hub.ts';
import type { InvestigationJob } from '../queue/types.ts';

export interface WorkerOptions {
  queue?: InvestigationQueue;
  eventHub?: InvestigationEventHub;
  concurrency?: number;
  pollIntervalMs?: number;
}

export class InvestigationWorker {
  private readonly queue: InvestigationQueue;
  private readonly eventHub: InvestigationEventHub;
  private readonly pollIntervalMs: number;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeJobsCount = 0;

  constructor(options: WorkerOptions = {}) {
    this.queue = options.queue ?? getInvestigationQueue();
    this.eventHub = options.eventHub ?? getEventHub();
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.schedulePoll();
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private schedulePoll(): void {
    if (!this.isRunning) return;
    this.pollTimer = setTimeout(async () => {
      try {
        await this.processNextJob();
      } catch (err) {
        console.error('Worker poll error:', err);
      } finally {
        if (this.isRunning) {
          this.schedulePoll();
        }
      }
    }, this.pollIntervalMs);
  }

  async processNextJob(): Promise<boolean> {
    const job = await this.queue.getNextJob();
    if (!job) return false;

    this.activeJobsCount++;
    try {
      await this.executeJob(job);
      return true;
    } finally {
      this.activeJobsCount--;
    }
  }

  async executeJob(job: InvestigationJob): Promise<void> {
    const abortController = new AbortController();
    this.queue.registerAbortController(job.id, abortController);

    await this.queue.updateJobStatus(job.id, 'running', {
      attempts: job.attempts + 1,
    });

    try {
      const data = job.data;
      let csvData = data.csvContent;
      let fileName = sanitizeFileName(
        data.fixtureName ?? (data.csvContent ? 'custom-dataset.csv' : 'melanoma-synthetic.csv')
      );

      // Resolve CSV from primary tabular artifact if not directly provided
      if (!csvData && data.artifacts && data.artifacts.length > 0) {
        const primaryArt =
          data.artifacts.find((a) => a.role === 'evaluation' || a.role === 'predictions') ??
          data.artifacts.find((a) => a.schema && a.schema.columns.length > 0);
        if (primaryArt && primaryArt.rawContent) {
          csvData = primaryArt.rawContent;
          fileName = sanitizeFileName(primaryArt.name);
        }
      }

      // Fallback to fixtures if neither CSV content nor artifacts exist
      if (!csvData) {
        const fixturePath = join(process.cwd(), 'public', 'fixtures', fileName);
        if (existsSync(fixturePath)) {
          csvData = readFileSync(fixturePath, 'utf8');
        } else {
          const fallbackPath = join(process.cwd(), 'public', 'fixtures', 'melanoma-synthetic.csv');
          csvData = readFileSync(fallbackPath, 'utf8');
          fileName = 'melanoma-synthetic.csv';
        }
      }

      const dsId = createId('dataset');
      const srcId = createId('source');
      const dataset = ingestEvaluationCsv(csvData, fileName, {
        datasetId: dsId,
        sourceId: srcId,
        columnMapping: data.columnMapping,
        labels: data.labels,
      });

      const provider = resolveInvestigatorProvider({ offlineOnly: data.offlineOnly });

      const generator = runAutonomousInvestigation(dataset, {
        investigationId: data.investigationId as any,
        provider,
        objective: data.objective ? sanitizeInputText(data.objective, 500) : undefined,
        userDirectives: data.userDirectives?.map((d) => sanitizeInputText(d, 500)),
        signal: abortController.signal,
      });

      let finalInvestigation: any = null;

      for await (const event of generator) {
        if (event.type === 'started') {
          saveInvestigationCsv(event.investigationId, csvData);
          if (data.artifacts && data.artifacts.length > 0) {
            saveInvestigationArtifacts(event.investigationId, data.artifacts);
          }
        } else if (event.type === 'completed' || event.type === 'stopped') {
          finalInvestigation = event.investigation;
        }

        // Stream telemetry event to reconnectable event hub
        this.eventHub.publish(data.investigationId, event);
      }

      if (finalInvestigation) {
        await saveInvestigation(finalInvestigation);
      }

      await this.queue.updateJobStatus(job.id, 'completed', {
        result: finalInvestigation ?? undefined,
      });
    } catch (err) {
      if (abortController.signal.aborted) {
        // Job was cancelled by user
        this.eventHub.publish(job.data.investigationId, {
          type: 'stopped',
          reason: 'Investigation cancelled by user',
          investigation: null as any,
        });
        await this.queue.updateJobStatus(job.id, 'cancelled', {
          error: 'Investigation cancelled by user',
        });
        return;
      }

      const errorMsg = err instanceof Error ? err.message : String(err);

      // Check retry bounds
      if (job.attempts < job.maxAttempts) {
        console.warn(`Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}). Re-enqueuing:`, errorMsg);
        this.eventHub.publish(job.data.investigationId, {
          type: 'error',
          code: 'WORKER_RETRY',
          message: `Transient error: ${errorMsg}. Retrying (attempt ${job.attempts + 1}/${job.maxAttempts})...`,
          fatal: false,
        });
        await this.queue.reEnqueue(job.id);
      } else {
        console.error(`Job ${job.id} exhausted all retries:`, errorMsg);
        this.eventHub.publish(job.data.investigationId, {
          type: 'error',
          code: 'EXECUTION_FAILED',
          message: errorMsg,
          fatal: true,
        });
        await this.queue.updateJobStatus(job.id, 'failed', {
          error: errorMsg,
        });
      }
    }
  }

  getActiveJobsCount(): number {
    return this.activeJobsCount;
  }
}

// Global worker instance
let globalWorker: InvestigationWorker | null = null;

export function getInvestigationWorker(): InvestigationWorker {
  if (!globalWorker) {
    globalWorker = new InvestigationWorker();
  }
  return globalWorker;
}

export function setInvestigationWorkerForTest(w: InvestigationWorker | null): void {
  globalWorker = w;
}
