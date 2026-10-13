'use client';

import React from 'react';
import { Layers, Cpu, Camera, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';

export type ModalityType = 'tabular' | 'llm' | 'vision';

export interface ModalitySelectorProps {
  activeModality: ModalityType;
  onChange: (modality: ModalityType) => void;
  showDescriptions?: boolean;
}

const MODALITY_CONFIGS: Record<
  ModalityType,
  {
    id: ModalityType;
    label: string;
    badge: string;
    icon: typeof Layers;
    color: string;
    description: string;
    capabilities: string[];
    href: string;
  }
> = {
  tabular: {
    id: 'tabular',
    label: 'Tabular ML',
    badge: 'Flagship Core',
    icon: Layers,
    color: 'var(--primary)',
    description: 'Autonomous statistical failure diagnosis for binary & multiclass tabular predictive models.',
    capabilities: ['101-pt Threshold Sweep', 'Subgroup Disparities', 'Miscalibration & KS-Drift', 'Cost Matrix Optimization'],
    href: '/investigate?modality=tabular',
  },
  llm: {
    id: 'llm',
    label: 'LLM & RAG Reliability',
    badge: 'LLM Suite',
    icon: Cpu,
    color: '#8b5cf6',
    description: 'Exact match, Token F1, JSON schema enforcement, RAG attribution & paired McNemar tests.',
    capabilities: ['MRR & Recall@k', 'Citation Grounding', 'Structured Rubric Judge', 'Prompt Pair Significance'],
    href: '/investigate/llm',
  },
  vision: {
    id: 'vision',
    label: 'Computer Vision',
    badge: 'Vision Suite',
    icon: Camera,
    color: '#10b981',
    description: 'Safe archive ingestion, discrete Laplacian quality drift, dHash near-duplicates & shortcut detection.',
    capabilities: ['CWE-409/22 Defense', 'Laplacian Sharpness', 'Cross-Split dHash Popcount', 'Confounder Odds Ratio'],
    href: '/investigate/vision',
  },
};

export default function ModalitySelector({
  activeModality,
  onChange,
  showDescriptions = false,
}: ModalitySelectorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Pill Switcher */}
      <div
        role="tablist"
        aria-label="Investigation Modality Switcher"
        style={{
          display: 'inline-flex',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '4px',
          gap: '4px',
          alignSelf: 'flex-start',
        }}
      >
        {(['tabular', 'llm', 'vision'] as ModalityType[]).map((modalityKey) => {
          const config = MODALITY_CONFIGS[modalityKey];
          const Icon = config.icon;
          const isActive = activeModality === modalityKey;

          return (
            <button
              key={modalityKey}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(modalityKey)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                fontSize: 'var(--text-xs)',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={14} style={{ color: isActive ? '#ffffff' : 'var(--text-muted)' }} />
              <span>{config.label}</span>
              {isActive && (
                <span
                  style={{
                    fontSize: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                  }}
                >
                  Active
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Optional rich summary card */}
      {showDescriptions && (
        <div
          className="card"
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--bg-surface-elevated, var(--bg-surface))',
            borderColor: 'var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                {MODALITY_CONFIGS[activeModality].label} Investigation Hub
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                {MODALITY_CONFIGS[activeModality].badge}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {MODALITY_CONFIGS[activeModality].description}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {MODALITY_CONFIGS[activeModality].capabilities.map((cap) => (
              <span
                key={cap}
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckCircle2 size={10} style={{ color: 'var(--status-success)' }} />
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
