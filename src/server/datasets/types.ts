export type DatasetRole = 'production_evaluation' | 'reference_baseline' | 'holdout_golden';

export type ColumnDataType = 'numeric' | 'string' | 'boolean' | 'datetime';

export interface ColumnSummary {
  name: string;
  dataType: ColumnDataType;
  totalCount: number;
  nullCount: number;
  missingRate: number; // 0.0 to 1.0
  distinctCount?: number;
  sampleValues: string[];
}

export interface ValidationIssue {
  code:
    | 'FILE_TYPE_REJECTED'
    | 'MALICIOUS_CONTENT'
    | 'ENCODING_ERROR'
    | 'JAGGED_ROWS'
    | 'FORMULA_INJECTION'
    | 'EMPTY_FILE'
    | 'SIZE_EXCEEDED'
    | 'MISSING_COLUMNS';
  severity: 'error' | 'warning';
  message: string;
  row?: number;
  column?: string;
}

export interface ValidationSummary {
  isValid: boolean;
  sha256: string;
  sizeBytes: number;
  rowCount: number;
  columnCount: number;
  columns: ColumnSummary[];
  injectedCellsCount: number;
  issues: ValidationIssue[];
  sanitizedContent?: string;
}

export interface DatasetRecord {
  id: string;
  projectId: string;
  organizationId: string;
  name: string;
  role: DatasetRole;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetVersionRecord {
  id: string;
  datasetId: string;
  versionNumber: number;
  objectKey: string;
  sha256: string;
  rowCount: number;
  columnCount: number;
  sizeBytes: number;
  schemaJson: {
    columns: ColumnSummary[];
  };
  summaryJson: {
    rowCount: number;
    columnCount: number;
    injectedCellsCount: number;
    issues: ValidationIssue[];
  };
  createdAt: string;
}

export interface InitiateUploadRequest {
  projectId: string;
  datasetName: string;
  role: DatasetRole;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface InitiateUploadResponse {
  uploadId: string;
  datasetId: string;
  versionId: string;
  objectKey: string;
  presignedUrl: string;
  method: 'PUT';
  headers?: Record<string, string>;
  expiresAt: string;
}

export interface CompleteUploadRequest {
  uploadId: string;
  datasetId: string;
  versionId: string;
  objectKey: string;
  projectId: string;
  datasetName: string;
  role: DatasetRole;
  expectedSha256?: string;
  sanitizeFormulas?: boolean;
}
