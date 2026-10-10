'use client';

import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { UploadCloud, FileText, AlertCircle, X } from 'lucide-react';
import { EVALUATION_LIMITS, previewEvaluationCsv } from '@/core/diagnostics/evaluation-ingestion';
import type { DatasetPreview } from '@/core/diagnostics/capability';

interface CsvDropzoneProps {
  onParsed: (preview: DatasetPreview, csvContent: string) => void;
  disabled?: boolean;
}

export default function CsvDropzone({ onParsed, disabled }: CsvDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setError(null);

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid CSV (.csv) file.');
      return;
    }

    if (file.size > EVALUATION_LIMITS.bytes) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of ${(EVALUATION_LIMITS.bytes / (1024 * 1024)).toFixed(0)} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        setError('Failed to read file as text.');
        return;
      }

      try {
        const preview = previewEvaluationCsv(text, file.name);
        setSelectedFile({ name: file.name, size: file.size });
        onParsed(preview, text);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Invalid CSV file format.';
        setError(message);
      }
    };
    reader.onerror = () => {
      setError('An error occurred while reading the file.');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />

      {selectedFile ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-4)',
            backgroundColor: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <FileText size={24} style={{ color: 'var(--color-success)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                {selectedFile.name}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {(selectedFile.size / 1024).toFixed(1)} KB &bull; Ready for column mapping
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 8px' }}
            title="Choose different file"
          >
            <X size={14} />
            Change
          </button>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-8) var(--space-4)',
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.06)' : 'var(--bg-surface)',
            transition: 'border-color 0.2s, background-color 0.2s',
          }}
        >
          <div style={{ display: 'inline-flex', padding: 'var(--space-3)', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', marginBottom: 'var(--space-3)' }}>
            <UploadCloud size={28} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
            Upload Your Dataset (CSV)
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
            Drag and drop your file here, or click to browse
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-4)', fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span>&bull; Up to 2 MB (10,000 rows)</span>
            <span>&bull; Binary classification</span>
            <span>&bull; Auto-detects columns</span>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-3)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-danger)',
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{error}</div>
        </div>
      )}
    </div>
  );
}
