'use client';

import React, { useRef, useState } from 'react';
import {
  type InvestigationArtifact,
  type ArtifactRole,
  type MultiArtifactValidationResult,
  artifactRoles,
} from '@/core/domain/artifacts';
import { ingestMultipleArtifacts, checkUnsafeModelBinary } from '@/core/diagnostics/multi-artifact-ingestion';
import {
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  Plus,
  ShieldAlert,
  Info,
} from 'lucide-react';

interface MultiArtifactDropzoneProps {
  artifacts: InvestigationArtifact[];
  validationResult: MultiArtifactValidationResult | null;
  onArtifactsChange: (artifacts: InvestigationArtifact[], validation: MultiArtifactValidationResult) => void;
  disabled?: boolean;
}

const roleDisplayLabels: Record<ArtifactRole, string> = {
  evaluation: 'Evaluation (Truth + Preds)',
  predictions: 'Model Predictions',
  reference: 'Reference Baseline',
  production: 'Production Inferences',
  training_log: 'Training Epoch Log',
  training: 'Training Split',
  validation: 'Validation Split',
  ground_truth: 'Ground Truth Labels',
  model_metadata: 'Model Metadata / Config',
};

export default function MultiArtifactDropzone({
  artifacts,
  validationResult,
  onArtifactsChange,
  disabled = false,
}: MultiArtifactDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setSecurityNotice(null);

    const inputs: Array<{ name: string; content: string }> = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      // Check for unsafe model binaries
      const securityCheck = checkUnsafeModelBinary(file.name);
      if (securityCheck.isUnsafeBinary) {
        setSecurityNotice(securityCheck.reason ?? 'Unsafe binary file detected.');
        continue;
      }

      try {
        const text = await file.text();
        inputs.push({ name: file.name, content: text });
      } catch (err) {
        console.error('Failed to read file:', file.name, err);
      }
    }

    if (inputs.length === 0) return;

    // Ingest new artifacts
    const { artifacts: newArtifacts } = ingestMultipleArtifacts(inputs);

    // Merge with existing artifacts (deduplicating by filename)
    const existingFiltered = artifacts.filter(
      (a) => !newArtifacts.some((n) => n.name.toLowerCase() === a.name.toLowerCase())
    );
    const combined = [...existingFiltered, ...newArtifacts];

    // Re-validate combined relationships
    const { validation } = ingestMultipleArtifacts(
      combined.map((a) => ({
        name: a.name,
        content: a.rawContent || '',
        roleOverride: a.role,
        formatOverride: a.format,
      }))
    );

    onArtifactsChange(combined, validation);
  };

  const handleRoleChange = (index: number, newRole: ArtifactRole) => {
    const updated = artifacts.map((art, i) => (i === index ? { ...art, role: newRole } : art));
    const { validation } = ingestMultipleArtifacts(
      updated.map((a) => ({
        name: a.name,
        content: a.rawContent || '',
        roleOverride: a.role,
        formatOverride: a.format,
      }))
    );
    onArtifactsChange(updated, validation);
  };

  const handleRemoveArtifact = (index: number) => {
    const updated = artifacts.filter((_, i) => i !== index);
    const { validation } = ingestMultipleArtifacts(
      updated.map((a) => ({
        name: a.name,
        content: a.rawContent || '',
        roleOverride: a.role,
        formatOverride: a.format,
      }))
    );
    onArtifactsChange(updated, validation);
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'json':
      case 'jsonl':
        return <FileCode className="w-5 h-5 text-amber-400 shrink-0" />;
      case 'text_log':
        return <FileText className="w-5 h-5 text-indigo-400 shrink-0" />;
      default:
        return <FileSpreadsheet className="w-5 h-5 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Security alert for blocked binaries */}
      {securityNotice && (
        <div
          className="alert alert-danger"
          role="alert"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}
        >
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--status-danger)', marginBottom: '2px' }}>
              Security Isolation Enforced
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {securityNotice}
            </div>
          </div>
        </div>
      )}

      {/* Hidden Accessible Native File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".csv,.tsv,.json,.jsonl,.log,.txt"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
        style={{ display: 'none' }}
        id="multi-artifact-file-input"
        aria-label="Upload ML artifact files"
      />

      {/* Dropzone Container */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload ML Artifacts dropzone. Press Enter or Space to browse files, or drag and drop files here."
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`upload-dropzone ${isDragging ? 'drag-active' : ''} ${disabled ? 'disabled' : ''}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: isDragging ? 'var(--primary-bg)' : 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDragging ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            <UploadCloud size={22} />
          </div>

          <div>
            <h3
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '4px',
                letterSpacing: '-0.01em',
              }}
            >
              Upload ML Artifacts
            </h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
              Drag and drop files here, or{' '}
              <span
                style={{
                  color: 'var(--primary)',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
              >
                browse local files
              </span>
            </p>
          </div>

          {/* Supported Format Badges & Limits */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-1)',
            }}
          >
            <span className="badge badge-neutral" style={{ fontSize: '12px' }}>
              .CSV
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '12px' }}>
              .TSV
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '12px' }}>
              .JSON
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '12px' }}>
              .JSONL
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '12px' }}>
              .LOG
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '4px' }}>
              • Max 2.0 MB per file
            </span>
          </div>
        </div>
      </div>

      {/* Uploaded Artifacts List */}
      {artifacts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Header with Counter and Add Another File Button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 var(--space-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Ingested Artifacts ({artifacts.length})
              </span>
              <span className="badge badge-info" style={{ fontSize: '12px' }}>
                Multi-Artifact Workspace
              </span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '12.5px', height: '30px', padding: '0 10px' }}
            >
              <Plus size={13} />
              Add Another File
            </button>
          </div>

          {/* Artifact Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {artifacts.map((artifact, idx) => (
              <div key={artifact.id || `${artifact.name}-${idx}`} className="artifact-card">
                <div className="artifact-card-info">
                  {getFormatIcon(artifact.format)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span
                        className="artifact-card-name"
                        title={artifact.name}
                        aria-label={`Filename: ${artifact.name}`}
                      >
                        {artifact.name}
                      </span>
                      <span
                        className="badge badge-neutral"
                        style={{ fontSize: '11px', textTransform: 'uppercase', padding: '2px 6px' }}
                      >
                        {artifact.format}
                      </span>
                    </div>

                    <div className="artifact-card-meta">
                      <span>{(artifact.sizeBytes / 1024).toFixed(1)} KB</span>
                      {artifact.schema && (
                        <>
                          <span>•</span>
                          <span>{artifact.schema.rowCount.toLocaleString()} rows</span>
                          <span>•</span>
                          <span>{artifact.schema.columns.length} cols</span>
                        </>
                      )}
                      {artifact.trainingLog && (
                        <>
                          <span>•</span>
                          <span>{artifact.trainingLog.totalEpochs} epochs</span>
                          <span>•</span>
                          <span style={{ textTransform: 'capitalize' }}>
                            {artifact.trainingLog.framework}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Role Selector & Actions */}
                <div className="artifact-card-actions">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <label
                      htmlFor={`artifact-role-${idx}`}
                      style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                    >
                      Role:
                    </label>
                    <select
                      id={`artifact-role-${idx}`}
                      value={artifact.role}
                      onChange={(e) => handleRoleChange(idx, e.target.value as ArtifactRole)}
                      disabled={disabled}
                      className="select-control"
                      style={{
                        width: '190px',
                        height: '32px',
                        fontSize: '13px',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {artifactRoles.map((role) => (
                        <option key={role} value={role}>
                          {roleDisplayLabels[role] ?? role.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Validation Status Indicator */}
                  {artifact.validationStatus === 'valid' && (
                    <span
                      title="Schema valid and ready for diagnostics"
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </span>
                  )}
                  {artifact.validationStatus === 'warning' && (
                    <span
                      title="Warning: schema issues detected"
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    </span>
                  )}
                  {artifact.validationStatus === 'invalid' && (
                    <span
                      title="Error: artifact could not be parsed"
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                      <XCircle className="w-4 h-4 text-rose-400" />
                    </span>
                  )}

                  {/* Accessible Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveArtifact(idx)}
                    disabled={disabled}
                    className="btn-icon btn-icon-danger"
                    title={`Remove ${artifact.name}`}
                    aria-label={`Remove artifact ${artifact.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Multi-Artifact Relationship Warnings & Errors */}
          {validationResult &&
            (validationResult.warnings.length > 0 || validationResult.errors.length > 0) && (
              <div
                className="alert alert-warning"
                style={{ flexDirection: 'column', gap: 'var(--space-2)' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontWeight: 600,
                    color: 'var(--status-warning)',
                  }}
                >
                  <AlertTriangle size={15} />
                  <span>Multi-Artifact Relationship Verification</span>
                </div>
                {validationResult.errors.map((err, i) => (
                  <div
                    key={`err-${i}`}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--status-danger)',
                      paddingLeft: 'var(--space-5)',
                    }}
                  >
                    • {err}
                  </div>
                ))}
                {validationResult.warnings.map((warn, i) => (
                  <div
                    key={`warn-${i}`}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-secondary)',
                      paddingLeft: 'var(--space-5)',
                    }}
                  >
                    • {warn}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
