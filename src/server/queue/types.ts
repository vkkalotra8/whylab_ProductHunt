import type { ColumnMapping } from '../../core/diagnostics/evaluation-ingestion.ts';
import type { InvestigationArtifact } from '../../core/domain/artifacts.ts';
import type { Investigation } from '../../core/domain/types.ts';
import type { InvestigationEventMessage } from '../orchestrator/investigator.ts';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface InvestigationJobData {
  jobId: string;
  investigationId: string;
  organizationId: string;
  projectId: string;
  datasetId?: string;
  csvContent?: string;
  fixtureName?: string;
  columnMapping?: ColumnMapping;
  labels?: { positive: string; negative: string };
  objective?: string;
  userDirectives?: string[];
  offlineOnly?: boolean;
  artifacts?: InvestigationArtifact[];
  autoStart?: boolean;
  createdAt: string;
}

export interface InvestigationJob {
  id: string;
  data: InvestigationJobData;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: Investigation;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface StreamEvent {
  eventId: number;
  investigationId: string;
  timestamp: string;
  payload: InvestigationEventMessage;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
}
