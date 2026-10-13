'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Sparkles, Settings2, AlertCircle } from 'lucide-react';
import type { LlmPricingConfig } from '@/core/domain/llm-types';
import type { SimpleJsonSchema } from '@/core/diagnostics/llm/schema-validator';

interface LlmDropzoneProps {
  onFileLoaded: (content: string, filename: string) => void;
  onPricingChange: (pricing: LlmPricingConfig | null) => void;
  onSchemaChange: (schema: SimpleJsonSchema | undefined) => void;
  isLoading?: boolean;
}

const SAMPLE_CUSTOMER_INTENT_SCHEMA: SimpleJsonSchema = {
  type: 'object',
  required: ['intent', 'urgency'],
  properties: {
    intent: { type: 'string' },
    urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
  },
};

export function LlmDropzone({
  onFileLoaded,
  onPricingChange,
  onSchemaChange,
  isLoading,
}: LlmDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [promptRate, setPromptRate] = useState<string>('2.50');
  const [completionRate, setCompletionRate] = useState<string>('10.00');
  const [enablePricing, setEnablePricing] = useState(false);
  const [enableSchema, setEnableSchema] = useState(false);
  const [schemaJsonText, setSchemaJsonText] = useState(
    JSON.stringify(SAMPLE_CUSTOMER_INTENT_SCHEMA, null, 2)
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        onFileLoaded(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handlePricingToggle = (enabled: boolean) => {
    setEnablePricing(enabled);
    if (enabled) {
      const p = parseFloat(promptRate);
      const c = parseFloat(completionRate);
      if (Number.isFinite(p) && Number.isFinite(c)) {
        onPricingChange({ promptCostPerMillion: p, completionCostPerMillion: c, currency: 'USD' });
      }
    } else {
      onPricingChange(null);
    }
  };

  const handlePricingInputChange = (pStr: string, cStr: string) => {
    setPromptRate(pStr);
    setCompletionRate(cStr);
    if (enablePricing) {
      const p = parseFloat(pStr);
      const c = parseFloat(cStr);
      if (Number.isFinite(p) && Number.isFinite(c)) {
        onPricingChange({ promptCostPerMillion: p, completionCostPerMillion: c, currency: 'USD' });
      }
    }
  };

  const handleSchemaToggle = (enabled: boolean) => {
    setEnableSchema(enabled);
    if (enabled) {
      try {
        const parsed = JSON.parse(schemaJsonText);
        setSchemaError(null);
        onSchemaChange(parsed);
      } catch (e) {
        setSchemaError((e as Error).message);
        onSchemaChange(undefined);
      }
    } else {
      setSchemaError(null);
      onSchemaChange(undefined);
    }
  };

  const loadFixture = async (path: string, filename: string) => {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      onFileLoaded(text, filename);
    } catch (e) {
      console.error('Failed to load fixture:', e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Drag & Drop Card */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          textAlign: 'center',
          background: dragActive ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-surface)',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jsonl,.csv,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
          }}
        />

        <UploadCloud size={38} color="var(--color-primary)" style={{ margin: '0 auto var(--space-2)' }} />
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-1)' }}>
          Drop LLM Evaluation File (.jsonl or .csv)
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 var(--space-3)' }}>
          Supports JSONL records and CSV tables with <code>prompt</code>, <code>response</code>, and optional <code>reference_answer</code>.
        </p>

        {/* Quick Sample Load Buttons */}
        <div
          style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 'var(--text-xs)', padding: '6px 12px' }}
            onClick={() => loadFixture('/fixtures/llm/customer-support-eval.jsonl', 'customer-support-eval.jsonl')}
          >
            <Sparkles size={13} style={{ marginRight: '5px' }} />
            Load Customer Support Fixture (.jsonl)
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 'var(--text-xs)', padding: '6px 12px' }}
            onClick={() => loadFixture('/fixtures/llm/qa-eval.csv', 'qa-eval.csv')}
          >
            <FileText size={13} style={{ marginRight: '5px' }} />
            Load QA Benchmark Fixture (.csv)
          </button>
        </div>
      </div>

      {/* Advanced Settings Accordion (Pricing & Schema) */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="btn btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', padding: 0, height: 'auto', color: 'var(--text-secondary)' }}
        >
          <Settings2 size={13} />
          {showConfig ? 'Hide Evaluation Parameters (Pricing & JSON Schema)' : 'Configure Pricing Assumptions & Target JSON Schema'}
        </button>

        {showConfig && (
          <div style={{ marginTop: 'var(--space-3)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
            {/* Pricing Section */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                <input
                  type="checkbox"
                  checked={enablePricing}
                  onChange={(e) => handlePricingToggle(e.target.checked)}
                />
                Supply Explicit Pricing Rates ($/1M Tokens)
              </label>
              <div style={{ opacity: enablePricing ? 1 : 0.4, display: 'flex', gap: 'var(--space-2)' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Prompt $/1M</span>
                  <input
                    type="number"
                    step="0.10"
                    disabled={!enablePricing}
                    value={promptRate}
                    onChange={(e) => handlePricingInputChange(e.target.value, completionRate)}
                    className="input"
                    style={{ fontSize: 'var(--text-xs)', width: '100%', height: '30px' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Completion $/1M</span>
                  <input
                    type="number"
                    step="0.10"
                    disabled={!enablePricing}
                    value={completionRate}
                    onChange={(e) => handlePricingInputChange(promptRate, e.target.value)}
                    className="input"
                    style={{ fontSize: 'var(--text-xs)', width: '100%', height: '30px' }}
                  />
                </div>
              </div>
            </div>

            {/* Schema Section */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                <input
                  type="checkbox"
                  checked={enableSchema}
                  onChange={(e) => handleSchemaToggle(e.target.checked)}
                />
                Validate Against Target JSON Schema
              </label>
              <textarea
                disabled={!enableSchema}
                value={schemaJsonText}
                onChange={(e) => {
                  setSchemaJsonText(e.target.value);
                  if (enableSchema) {
                    try {
                      const p = JSON.parse(e.target.value);
                      setSchemaError(null);
                      onSchemaChange(p);
                    } catch (err) {
                      setSchemaError((err as Error).message);
                      onSchemaChange(undefined);
                    }
                  }
                }}
                className="input"
                style={{
                  width: '100%',
                  height: '80px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  opacity: enableSchema ? 1 : 0.4,
                  padding: '6px',
                }}
              />
              {schemaError && (
                <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px' }}>
                  <AlertCircle size={11} style={{ display: 'inline', marginRight: '3px' }} />
                  {schemaError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
