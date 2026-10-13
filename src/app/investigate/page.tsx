'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Breadcrumbs from '@/ui/components/shell/breadcrumbs';
import ModalitySelector, { type ModalityType } from '@/ui/components/ingest/modality-selector';
import MultiArtifactDropzone from '@/ui/components/ingest/multi-artifact-dropzone';
import ColumnMapper from '@/ui/components/ingest/column-mapper';
import CapabilityChecklist from '@/ui/components/ingest/capability-checklist';
import CapabilityManifestView from '@/ui/components/ingest/capability-manifest-view';
import type { DatasetPreview, InferredColumnMapping } from '@/core/diagnostics/capability';
import { evaluateCapabilities, evaluateMultiArtifactCapabilities } from '@/core/diagnostics/capability';
import { previewEvaluationCsv } from '@/core/diagnostics/evaluation-ingestion';
import type { InvestigationArtifact, MultiArtifactValidationResult } from '@/core/domain/artifacts';
import { BaselineOptInModal } from '@/ui/components/ingest/baseline-opt-in-modal';
import { trainExperimentalBaseline, type BaselineTrainingResult } from '@/core/inference/baseline-trainer';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  UploadCloud,
  BarChart2,
  ShieldAlert,
  Sliders,
  FileText,
  AlertTriangle,
  Info,
  Maximize2,
  Minimize2,
  X,
  Layers,
  Wrench,
  Lock,
  Cpu,
  Camera,
} from 'lucide-react';

function getStages(hasNoPredictions: boolean) {
  return [
    { id: 'ingest', num: '01', name: 'Ingest', desc: 'Dataset upload & schema' },
    {
      id: 'profile',
      num: '02',
      name: 'Profile',
      desc: hasNoPredictions ? 'Distribution, quality & missingness' : 'Prevalence & baseline metrics',
    },
    {
      id: 'investigate',
      num: '03',
      name: 'Investigate',
      desc: hasNoPredictions ? 'Autonomous data quality audit' : 'Astra tool orchestration',
    },
    {
      id: 'verify',
      num: '04',
      name: 'Verify',
      desc: hasNoPredictions ? 'Association & drift screening' : 'Falsification experiments',
    },
    {
      id: 'repair',
      num: '05',
      name: 'Repair',
      desc: hasNoPredictions ? 'Data curation & hygiene policy' : '101-point policy optimization',
    },
    {
      id: 'report',
      num: '06',
      name: 'Report',
      desc: hasNoPredictions ? 'Certified data intelligence report' : 'Certified incident report',
    },
  ];
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  raw?: unknown;
}

export default function InvestigatePage() {
  const [activeModality, setActiveModality] = useState<ModalityType>('tabular');
  const [activeStage, setActiveStage] = useState('ingest');
  const [sourceMode, setSourceMode] = useState<'upload' | 'benchmark'>('upload');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mod = params.get('modality');
      if (mod === 'llm' || mod === 'vision' || mod === 'tabular') {
        setActiveModality(mod);
      }
    }
  }, []);

  const handleModalityChange = (mod: ModalityType) => {
    setActiveModality(mod);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('modality', mod);
      window.history.replaceState(null, '', url.toString());
    }
  };
  const [selectedFixture, setSelectedFixture] = useState<string>('melanoma-synthetic.csv');
  const [customPreview, setCustomPreview] = useState<DatasetPreview | null>(null);
  const [customCsv, setCustomCsv] = useState<string | null>(null);
  const [customMapping, setCustomMapping] = useState<InferredColumnMapping | null>(null);
  const [customLabels, setCustomLabels] = useState<{ positive: string; negative: string } | null>(null);
  const [artifacts, setArtifacts] = useState<InvestigationArtifact[]>([]);
  const [validationResult, setValidationResult] = useState<MultiArtifactValidationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [steeringInput, setSteeringInput] = useState('');
  const [activeDirectives, setActiveDirectives] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [completedInvestigationId, setCompletedInvestigationId] = useState<string | null>(null);
  const [roundInfo, setRoundInfo] = useState<{ round: number; maxRounds: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to start investigation.');
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll terminal when new logs arrive
  useEffect(() => {
    if (telemetryOpen && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, telemetryOpen]);

  const appendLog = (type: string, message: string, raw?: unknown) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
        raw,
      },
    ]);
  };

  const [isBaselineModalOpen, setIsBaselineModalOpen] = useState(false);
  const [activeBaseline, setActiveBaseline] = useState<BaselineTrainingResult | null>(null);

  const handleGenerateBaseline = (config: {
    seed: number;
    modelType: 'logistic_regression';
    trainRatio: number;
    valRatio: number;
    testRatio: number;
  }) => {
    if (!customPreview || !customCsv) return;
    const targetCol = customMapping?.targetColumn ?? customPreview.inferredMapping.targetColumn;
    if (!targetCol) return;

    const posLabel = customLabels?.positive ?? customPreview.detectedLabels?.positive ?? '1';
    const negLabel = customLabels?.negative ?? customPreview.detectedLabels?.negative ?? '0';

    const lines = customCsv.trim().split(/\r?\n/);
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = vals[i] ?? '';
      });
      return obj;
    });

    try {
      const result = trainExperimentalBaseline({
        datasetName: customPreview.fileName,
        rows,
        targetColumn: targetCol,
        positiveLabel: posLabel,
        negativeLabel: negLabel,
        seed: config.seed,
        trainRatio: config.trainRatio,
        valRatio: config.valRatio,
        testRatio: config.testRatio,
        optInConfirmed: true,
      });

      setActiveBaseline(result);

      // Create augmented CSV with _baseline_pred and _baseline_prob
      const newHeaders = [...headers, '_baseline_pred', '_baseline_prob'];
      const newLines = [newHeaders.join(',')];
      for (let i = 0; i < rows.length; i++) {
        const pred = result.predictions[i];
        const origLine = lines[i + 1];
        newLines.push(`${origLine},${pred.predicted},${pred.probability}`);
      }
      const augmentedCsv = newLines.join('\n');
      setCustomCsv(augmentedCsv);

      const newPreview = previewEvaluationCsv(augmentedCsv, customPreview.fileName);
      setCustomPreview(newPreview);

      const updatedMapping: InferredColumnMapping = {
        ...(customMapping ?? customPreview.inferredMapping),
        targetColumn: targetCol,
        predictionColumn: '_baseline_pred',
        probabilityColumn: '_baseline_prob',
      };
      setCustomMapping(updatedMapping);

      appendLog(
        'system',
        `[EXPERIMENTAL BASELINE ACTIVE] Model: ${result.modelType}, Seed: ${result.seed}, Holdout F1: ${result.holdoutMetrics.f1}, ROC-AUC: ${result.holdoutMetrics.rocAuc ?? 'N/A'}`
      );
    } catch (err) {
      appendLog(
        'error',
        `Baseline training failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleStartInvestigation = async (fixtureName = selectedFixture) => {
    setIsRunning(true);
    setTelemetryOpen(true);
    setLogs([]);
    setCompletedInvestigationId(null);
    setRoundInfo(null);
    setStatusMessage('Connecting to Astra Autonomous Orchestrator...');

    const isCustom = sourceMode === 'upload' && customCsv && customPreview;
    const sessionName = isCustom ? customPreview.fileName : fixtureName;
    appendLog('system', `Initializing investigation session for ${sessionName}...`);

    abortControllerRef.current = new AbortController();

    try {
      const payload: Record<string, unknown> = {
        directives: activeDirectives,
      };

      if (isCustom) {
        payload.csvContent = customCsv;
        payload.fixtureName = customPreview.fileName;
        payload.columnMapping = customMapping ?? customPreview.inferredMapping;
        payload.labels = customLabels ?? customPreview.detectedLabels ?? { positive: '1', negative: '0' };
        payload.artifacts = artifacts;
      } else {
        payload.fixtureName = fixtureName;
      }

      const res = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok || !res.body) {
        let errorDetail = '';
        try {
          const errData = await res.json();
          errorDetail = errData.error || errData.message || '';
        } catch {
          // ignore
        }
        throw new Error(errorDetail || `Server returned error status: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleEvent(event);
          } catch (e) {
            console.error('Failed to parse NDJSON line:', e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          handleEvent(event);
        } catch {
          // ignore trailing partial
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : String(err);
        appendLog('error', `Investigation error: ${msg}`);
        setStatusMessage(`Error: ${msg}`);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleEvent = (event: Record<string, unknown>) => {
    switch (event.type) {
      case 'started': {
        const invId = event.investigationId as string;
        const providerInfo = event.provider ? ` [Provider: ${event.provider}${event.model ? ` / ${event.model}` : ''}]` : '';
        appendLog('started', `Investigation ${invId} registered.${providerInfo} Objective: ${event.objective}`);
        setActiveStage('profile');
        break;
      }
      case 'progress': {
        const round = event.round as number;
        const max = event.maxRounds as number;
        const stage = event.stage as string;
        const msg = event.message as string;
        setRoundInfo({ round, maxRounds: max });
        setStatusMessage(msg);
        if (stage && stages.some((s) => s.id === stage)) {
          setActiveStage(stage);
        }
        appendLog('progress', `[Round ${round}/${max}] ${msg}`);
        break;
      }
      case 'tool_call': {
        const call = event.call as { tool: string; input: Record<string, unknown> };
        const rationale = (event.rationale as string) ?? '';
        appendLog('tool_call', `→ Dispatched ${call.tool}: ${rationale}`);
        break;
      }
      case 'tool_result': {
        const result = event.result as { tool: string; status: string };
        appendLog('tool_result', `← ${result.tool} finished with status '${result.status}'.`);
        break;
      }
      case 'hypothesis_added': {
        const hyp = event.hypothesis as { statement: string };
        appendLog('hypothesis', `💡 Formulated hypothesis: "${hyp.statement}"`);
        setActiveStage('investigate');
        break;
      }
      case 'experiment_added': {
        const exp = event.experiment as { method: string; outcome: string };
        appendLog('experiment', `🔬 Verification experiment completed (${exp.method}) - Outcome: ${exp.outcome.toUpperCase()}`);
        setActiveStage('verify');
        break;
      }
      case 'repair_added': {
        const rep = event.repair as { kind: string; rationale: string };
        appendLog('repair', `🛠️ Repair candidate proposed (${rep.kind}): ${rep.rationale}`);
        setActiveStage('repair');
        break;
      }
      case 'comparison_added': {
        const comp = event.comparison as { status: string };
        appendLog('comparison', `⚖️ Before-vs-after re-evaluation completed: Status ${comp.status.toUpperCase()}`);
        break;
      }
      case 'diagnosis_finalized': {
        const diag = event.diagnosis as { summary: string; confidence: { level: string } };
        appendLog('diagnosis', `🎯 Diagnosis finalized (${diag.confidence.level} confidence): ${diag.summary}`);
        setActiveStage('report');
        break;
      }
      case 'completed': {
        const inv = event.investigation as { id: string };
        setCompletedInvestigationId(inv.id);
        const usage = event.usage as { totalTokens?: number; promptTokens?: number; completionTokens?: number } | undefined;
        const usageDetail = usage?.totalTokens ? ` [Tokens: ${usage.totalTokens} (${usage.promptTokens} in / ${usage.completionTokens} out)]` : '';
        setStatusMessage(`Investigation completed successfully! ID: ${inv.id}`);
        appendLog('system', `Investigation complete.${usageDetail} Saved with ID ${inv.id}.`);
        break;
      }
      case 'stopped': {
        appendLog('system', `Investigation stopped: ${event.reason}`);
        break;
      }
      case 'error': {
        appendLog('error', `Error (${event.code}): ${event.message}`);
        break;
      }
    }
  };

  const handleAddDirective = (e: React.FormEvent) => {
    e.preventDefault();
    if (!steeringInput.trim()) return;
    const text = steeringInput.trim();
    setActiveDirectives((prev) => [...prev, text]);
    appendLog('steering', `User Directive added: "${text}"`);
    setSteeringInput('');
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsRunning(false);
      appendLog('system', 'User aborted investigation execution.');
    }
  };

  const hasNoPredictions = Boolean(sourceMode === 'upload' && customPreview && !customMapping?.predictionColumn);
  const stages = getStages(hasNoPredictions);

  // Derive stage status for the 6-stage workflow
  const getStageStatus = (stageId: string): 'completed' | 'available' | 'active' | 'locked' | 'missing_evidence' => {
    if (completedInvestigationId) return 'completed';
    if (stageId === activeStage) return 'active';
    if (stageId === 'ingest') {
      return customCsv || selectedFixture ? 'completed' : 'active';
    }
    if (stageId === 'profile') {
      return customPreview || selectedFixture ? 'available' : 'locked';
    }
    if (stageId === 'investigate') {
      if (isRunning) return 'active';
      return customPreview || selectedFixture ? 'available' : 'locked';
    }
    if (stageId === 'verify' || stageId === 'repair') {
      if (hasNoPredictions) {
        if (completedInvestigationId) return 'completed';
        return isRunning ? 'active' : 'available';
      }
      return isRunning ? 'active' : 'locked';
    }
    if (stageId === 'report') {
      return completedInvestigationId ? 'completed' : 'locked';
    }
    return 'locked';
  };

  return (
    <div style={{ paddingBottom: 'var(--space-16)' }}>
      <Breadcrumbs items={[{ label: 'investigate', href: '/investigate' }, { label: activeStage }]} />

      <div className="container-wide" style={{ paddingTop: 'var(--space-6)' }}>
        {/* Multi-Modal Modality Selector */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <ModalitySelector
            activeModality={activeModality}
            onChange={handleModalityChange}
            showDescriptions={true}
          />
        </div>

        {/* Studio Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
            paddingBottom: 'var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
              <h1
                style={{
                  fontSize: 'var(--text-2xl)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                Investigation Studio
              </h1>
              <span className={`badge ${isRunning ? 'badge-accent' : 'badge-neutral'}`}>
                {isRunning ? 'Orchestrating Autonomous Loop' : 'Interactive Session'}
              </span>
              {roundInfo && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--primary)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  Round {roundInfo.round}/{roundInfo.maxRounds}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', margin: 0 }}>
              {statusMessage}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              type="button"
              onClick={() => setTelemetryOpen(!telemetryOpen)}
              className="btn btn-secondary btn-sm"
              title={telemetryOpen ? 'Hide Astra console' : 'Open Astra console'}
            >
              <Terminal size={13} />
              <span>{telemetryOpen ? 'Hide Astra Console' : `Astra Console (${logs.length})`}</span>
            </button>

            <div className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={12} />
              Astra Agentic Supervisor: Active
            </div>

            {isRunning ? (
              <button onClick={handleStop} className="btn btn-danger btn-sm">
                Stop Loop
              </button>
            ) : (
              <button
                onClick={() => {
                  setActiveStage('ingest');
                  setLogs([]);
                  setCompletedInvestigationId(null);
                  setStatusMessage('Session reset.');
                }}
                className="btn btn-secondary btn-sm"
                title="Reset session"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* 6-Stage Stepper Navigation */}
        <nav
          className="stage-stepper"
          style={{ marginBottom: 'var(--space-6)' }}
          aria-label="Investigation Stages"
        >
          {stages.map((stage, idx) => {
            const isActive = activeStage === stage.id;
            const status = getStageStatus(stage.id);
            const isClickable = status !== 'locked' || isRunning;

            return (
              <button
                key={stage.id}
                onClick={() => isClickable && setActiveStage(stage.id)}
                disabled={!isClickable}
                className={`stage-step ${isActive ? 'active' : ''} ${status === 'completed' ? 'completed' : ''}`}
                aria-current={isActive ? 'step' : undefined}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: isClickable ? 'pointer' : 'not-allowed',
                  opacity: !isClickable ? 0.45 : 1,
                }}
              >
                <span className="stage-step-num">{stage.num}</span>
                <span>{stage.name}</span>
                {status === 'completed' && <CheckCircle2 size={12} style={{ color: 'var(--status-success)' }} />}
                {status === 'missing_evidence' && (
                  <span className="badge badge-warning" style={{ fontSize: '11px', padding: '2px 6px' }}>
                    Partial
                  </span>
                )}
                {idx < stages.length - 1 && <span className="stage-arrow">→</span>}
              </button>
            );
          })}
        </nav>

        {/* Main Grid: Workbench Controls + Collapsible Astra Telemetry Terminal */}
        <div className={`studio-grid ${telemetryOpen ? 'studio-grid-split' : 'studio-grid-full'}`}>
          {/* Left Panel: Active Stage Workbench */}
          <div className="card card-elevated" style={{ padding: 'var(--space-6)' }}>
            {/* STAGE 01: INGEST */}
            {activeStage === 'ingest' && (
              <>
                {activeModality === 'llm' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
                      <div>
                        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Cpu size={18} style={{ color: '#8b5cf6' }} />
                          LLM & RAG Reliability Ingestion Hub
                        </h3>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          Deterministic evaluation of NLP exact match, Token F1, strict JSON schemas, and multi-passage RAG grounding.
                        </p>
                      </div>
                      <span className="badge badge-accent">LLM Guard Suite</span>
                    </div>

                    {/* Preloaded Flagship RAG Benchmark */}
                    <div className="card" style={{ padding: 'var(--space-5)', backgroundColor: 'var(--bg-surface)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span className="badge badge-primary" style={{ fontSize: '10px' }}>FLAGSHIP BENCHMARK</span>
                            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                              RAG Golden Retrieval & Grounding Benchmark (<code>rag-eval.jsonl</code>)
                            </strong>
                          </div>
                          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '4px 0 0', maxWidth: '600px' }}>
                            40 Clinical QA queries with 5 retrieval context passages each, citation tags (<code>[doc_id]</code>), and golden reference answers.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <Link href="/investigate/llm" className="btn btn-primary btn-sm">
                            <Play size={13} />
                            Launch LLM Investigation Studio
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* LLM Engine Capability Checklist */}
                    <div className="card" style={{ padding: 'var(--space-4)' }}>
                      <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-3)' }}>
                        Verified LLM Diagnostics Checklist
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-2)' }}>
                        {[
                          { label: 'Exact Match & Token Overlap F1', desc: 'Case-sensitive & normalized token-level similarity' },
                          { label: 'JSON Schema Validation', desc: 'Syntactic parse & required property structural check' },
                          { label: 'RAG Retrieval Ranking', desc: 'Mean Reciprocal Rank (MRR) & Recall@k' },
                          { label: 'Context Attribution Audit', desc: 'Sentence-level support & phantom citation detector' },
                          { label: 'Paired McNemar Tests', desc: 'Statistical significance testing across prompt variants' },
                        ].map((cap) => (
                          <div key={cap.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                            <CheckCircle2 size={14} style={{ color: 'var(--status-success)', marginTop: '2px', flexShrink: 0 }} />
                            <div>
                              <strong style={{ fontSize: 'var(--text-xs)', display: 'block', color: 'var(--text-primary)' }}>{cap.label}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cap.desc}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : activeModality === 'vision' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
                      <div>
                        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Camera size={18} style={{ color: '#10b981' }} />
                          Computer Vision Diagnostic Ingestion Hub
                        </h3>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          Memory-safe image decompression, discrete Laplacian quality shifts, and cross-split dHash leakage scans.
                        </p>
                      </div>
                      <span className="badge badge-accent">Vision Diagnostic Suite</span>
                    </div>

                    {/* Preloaded Flagship Vision Benchmark */}
                    <div className="card" style={{ padding: 'var(--space-5)', backgroundColor: 'var(--bg-surface)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span className="badge badge-primary" style={{ fontSize: '10px' }}>FLAGSHIP BENCHMARK</span>
                            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                              Clinical Dermatology Benchmark (<code>public/fixtures/vision/</code>)
                            </strong>
                          </div>
                          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '4px 0 0', maxWidth: '600px' }}>
                            150 Dermoscopic lesion cases across Tripod (Site A) & Handheld (Site B) devices with 3 planted near-duplicate leakages and scale ruler confounders.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <Link href="/investigate/vision" className="btn btn-primary btn-sm">
                            <Play size={13} />
                            Launch Vision Investigation Studio
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Vision Diagnostics Checklist */}
                    <div className="card" style={{ padding: 'var(--space-4)' }}>
                      <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-3)' }}>
                        Verified Computer Vision Diagnostics Checklist
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-2)' }}>
                        {[
                          { label: 'CWE-409/22 Decompression Defenses', desc: 'Guards against decompression bombs and path traversals' },
                          { label: 'Discrete Laplacian Sharpness & Contrast', desc: 'Deterministic kernel variance and histogram metrics' },
                          { label: '64-bit dHash Leakage Engine', desc: 'Pairwise Hamming popcount near-duplicate detection' },
                          { label: 'Two-Sample KS & PSI Quality Shift', desc: 'Site A vs Site B distribution drift analysis' },
                          { label: 'Shortcut Learning Confounder Odds Ratio', desc: 'Quantifies recall collapse when artifacts are missing' },
                        ].map((cap) => (
                          <div key={cap.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                            <CheckCircle2 size={14} style={{ color: 'var(--status-success)', marginTop: '2px', flexShrink: 0 }} />
                            <div>
                              <strong style={{ fontSize: 'var(--text-xs)', display: 'block', color: 'var(--text-primary)' }}>{cap.label}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cap.desc}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Source Mode Switcher */}
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-6)',
                    borderBottom: '1px solid var(--border-default)',
                    paddingBottom: 'var(--space-3)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSourceMode('upload')}
                    disabled={isRunning}
                    className={`btn btn-sm ${sourceMode === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    <UploadCloud size={14} />
                    Upload Your Dataset
                  </button>

                  <button
                    type="button"
                    onClick={() => setSourceMode('benchmark')}
                    disabled={isRunning}
                    className={`btn btn-sm ${sourceMode === 'benchmark' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    <Database size={14} />
                    Preloaded Benchmarks
                  </button>
                </div>

                {/* Custom Upload Mode */}
                {sourceMode === 'upload' && (
                  <div style={{ marginBottom: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                      <MultiArtifactDropzone
                        artifacts={artifacts}
                        validationResult={validationResult}
                        onArtifactsChange={(newArtifacts, newValidation) => {
                          setArtifacts(newArtifacts);
                          setValidationResult(newValidation);
                          const primary =
                            newArtifacts.find((a) => a.role === 'evaluation' || a.role === 'predictions') ??
                            newArtifacts.find((a) => a.schema && a.schema.columns.length > 0);
                          if (primary && primary.rawContent) {
                            try {
                              const preview = previewEvaluationCsv(primary.rawContent, primary.name);
                              setCustomPreview(preview);
                              setCustomCsv(primary.rawContent);
                              setCustomMapping(preview.inferredMapping);
                              if (preview.detectedLabels) setCustomLabels(preview.detectedLabels);
                            } catch {
                              // Handled by validation in dropzone
                            }
                          } else if (!primary) {
                            setCustomPreview(null);
                            setCustomCsv(null);
                          }
                        }}
                        disabled={isRunning}
                      />

                      {customPreview && (
                        <ColumnMapper
                          preview={customPreview}
                          onMappingChange={(m, l) => {
                            setCustomMapping(m);
                            setCustomLabels(l);
                          }}
                          disabled={isRunning}
                        />
                      )}

                      {(() => {
                        const baseCaps = customPreview
                          ? evaluateCapabilities(
                              customPreview.columns,
                              customMapping ?? customPreview.inferredMapping
                            )
                          : undefined;
                        const caps = evaluateMultiArtifactCapabilities(artifacts, baseCaps);
                        const isLabelOnly = hasNoPredictions;

                        return (
                          <div style={{ marginTop: 'var(--space-2)' }}>
                            {activeBaseline && (
                              <div
                                style={{
                                  padding: '10px 14px',
                                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                  border: '1px solid rgba(245, 158, 11, 0.4)',
                                  borderRadius: 'var(--radius-md)',
                                  marginBottom: 'var(--space-3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  fontSize: '12px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                                    ⚡ EXPERIMENTAL BASELINE ACTIVE
                                  </span>
                                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>Seed: {activeBaseline.seed}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    Holdout ROC-AUC: {activeBaseline.holdoutMetrics.rocAuc ?? 'N/A'}
                                  </span>
                                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    Holdout F1: {activeBaseline.holdoutMetrics.f1}
                                  </span>
                                </div>
                                <span style={{ fontSize: '11px', color: 'rgba(245, 158, 11, 0.8)', fontStyle: 'italic', fontFamily: 'var(--font-mono)' }}>
                                  Diagnostic reference only. Never deploy to production.
                                </span>
                              </div>
                            )}

                            <CapabilityManifestView
                              capabilities={caps}
                              manifest={customPreview?.manifest}
                              onLaunchInvestigation={() => handleStartInvestigation()}
                              onGenerateBaseline={() => setIsBaselineModalOpen(true)}
                              isRunning={isRunning}
                            />

                            {customPreview && (
                              <BaselineOptInModal
                                isOpen={isBaselineModalOpen}
                                onClose={() => setIsBaselineModalOpen(false)}
                                onConfirm={handleGenerateBaseline}
                                datasetName={customPreview.fileName}
                                targetColumn={customMapping?.targetColumn ?? customPreview.inferredMapping.targetColumn ?? 'y_true'}
                                positiveLabel={customLabels?.positive ?? customPreview.detectedLabels?.positive ?? '1'}
                                rowCount={customPreview.totalRows}
                              />
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Benchmark Fixtures Mode */}
                {sourceMode === 'benchmark' && (
                  <>
                    <div
                      style={{
                        padding: 'var(--space-5)',
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-6)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                        <span className="badge badge-info">FLAGSHIP BENCHMARK</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Deterministic Offline</span>
                      </div>
                      <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                        Melanoma Classifier (Accuracy Paradox)
                      </h3>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-4)' }}>
                        94.2% top-line accuracy hiding 22.4% malignant recall across 20,000 patient test cases. Tests autonomous discovery of severe minority omission and threshold optimization.
                      </p>
                      <button
                        disabled={isRunning}
                        onClick={() => handleStartInvestigation('melanoma-synthetic.csv')}
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%' }}
                      >
                        {isRunning ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Running Multi-Turn Loop...
                          </>
                        ) : (
                          <>
                            <Play size={14} />
                            Launch Autonomous Investigation
                          </>
                        )}
                      </button>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                      <label htmlFor="benchmark-select" className="form-label">
                        Or Select Alternative Benchmark:
                      </label>
                      <select
                        id="benchmark-select"
                        disabled={isRunning}
                        value={selectedFixture}
                        onChange={(e) => setSelectedFixture(e.target.value)}
                        className="select-control"
                      >
                        <option value="melanoma-synthetic.csv">melanoma-synthetic.csv (Accuracy Paradox)</option>
                        <option value="kaggle_icu_sepsis_benchmark.csv">kaggle_icu_sepsis_benchmark.csv (Sepsis Clinical Alert)</option>
                        <option value="kaggle_stroke_dataset.csv">kaggle_stroke_dataset.csv (Stroke Risk Imbalance)</option>
                        <option value="overconfident-classifier.csv">overconfident-classifier.csv (Calibration Failure)</option>
                        <option value="site-failure.csv">site-failure.csv (Multi-Site Covariate Shift)</option>
                      </select>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

            {/* STAGE 02: PROFILE */}
            {activeStage === 'profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      Dataset Profiling & Descriptive Statistics
                    </h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      Baseline sample health, missingness distribution, and feature schemas
                    </p>
                  </div>
                  <button onClick={() => setActiveStage('ingest')} className="btn btn-secondary btn-sm">
                    Back to Ingest
                  </button>
                </div>

                {customPreview ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {/* Summary metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
                      <div className="metric-card">
                        <span className="metric-label">Total Rows</span>
                        <span className="metric-value">{customPreview.totalRows.toLocaleString()}</span>
                        <span className="metric-meta">Ingested rows</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Columns</span>
                        <span className="metric-value">{customPreview.columns.length}</span>
                        <span className="metric-meta">Features & targets</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Target Column</span>
                        <span className="metric-value" style={{ fontSize: 'var(--text-lg)' }}>
                          {customMapping?.targetColumn ?? 'None'}
                        </span>
                        <span className="metric-meta">Ground truth</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Predictions</span>
                        <span className="metric-value" style={{ fontSize: 'var(--text-lg)', color: customMapping?.predictionColumn ? 'var(--status-success)' : 'var(--status-warning)' }}>
                          {customMapping?.predictionColumn ? 'Mapped' : 'Missing'}
                        </span>
                        <span className="metric-meta">Model inferences</span>
                      </div>
                    </div>

                    {/* Column Profile Table */}
                    <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: '100%', maxWidth: '100%' }}>
                      <div style={{ padding: 'var(--space-2) var(--space-4)', backgroundColor: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        COLUMN STATISTICS & DATA QUALITY
                      </div>
                      <div style={{ overflowX: 'auto', maxHeight: '300px', width: '100%', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
                        <table className="table-modern">
                          <thead>
                            <tr>
                              <th>Column</th>
                              <th>Type</th>
                              <th>Distinct Count</th>
                              <th>Missing Values</th>
                              <th>Sample Values</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customPreview.columns.map((col) => (
                              <tr key={col.name}>
                                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {col.name}
                                </td>
                                <td>
                                  <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                    {col.detectedType}
                                  </span>
                                </td>
                                <td>{col.distinctCount.toLocaleString()}</td>
                                <td>
                                  {col.missingCount > 0 ? (
                                    <span style={{ color: 'var(--status-warning)' }}>
                                      {col.missingCount} ({((col.missingCount / customPreview.totalRows) * 100).toFixed(1)}%)
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--status-success)' }}>0 (0%)</span>
                                  )}
                                </td>
                                <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                                  {col.sampleValues.slice(0, 3).join(', ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <button
                        onClick={() => handleStartInvestigation()}
                        disabled={isRunning}
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1 }}
                      >
                        {isRunning ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            Running Investigation...
                          </>
                        ) : !hasNoPredictions ? (
                          <>
                            <Play size={13} />
                            Launch Full Investigation
                          </>
                        ) : (
                          <>
                            <Sparkles size={13} />
                            Launch Dataset Intelligence Investigation
                          </>
                        )}
                      </button>
                      {hasNoPredictions && (
                        <button onClick={() => setActiveStage('ingest')} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                          <UploadCloud size={13} />
                          Upload Predictions (Optional)
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                    No dataset uploaded yet. Return to the Ingest stage to upload a dataset or select a benchmark.
                  </div>
                )}
              </div>
            )}

            {/* STAGE 03: INVESTIGATE */}
            {activeStage === 'investigate' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      Autonomous Investigation Loop
                    </h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      Astra agentic supervisory loop executing diagnostic tools and generating falsifications
                    </p>
                  </div>
                  <span className={`badge ${isRunning ? 'badge-accent' : 'badge-neutral'}`}>
                    {isRunning ? 'Running' : 'Idle'}
                  </span>
                </div>

                {!isRunning && !completedInvestigationId && (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                    <Play size={28} style={{ color: 'var(--primary)', margin: '0 auto var(--space-3)' }} />
                    <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-2)' }}>
                      Ready to Launch Investigation
                    </h4>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto var(--space-4)' }}>
                      {hasNoPredictions
                        ? 'Click below to dispatch autonomous dataset intelligence screening for data hygiene, duplicate entities, feature-target leakage, and quality risks.'
                        : 'Click below to dispatch the autonomous multi-turn loop and test for class imbalance, calibration failure, and slice disparity.'}
                    </p>
                    <button
                      onClick={() => handleStartInvestigation()}
                      disabled={isRunning}
                      className="btn btn-primary btn-sm"
                    >
                      {hasNoPredictions ? (
                        <>
                          <Sparkles size={13} />
                          Launch Dataset Intelligence Investigation
                        </>
                      ) : (
                        <>
                          <Play size={13} />
                          Launch Autonomous Investigation
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* STAGE 04 & 05: VERIFY & REPAIR */}
            {(activeStage === 'verify' || activeStage === 'repair') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', margin: 0, textTransform: 'capitalize' }}>
                    Stage: {activeStage}
                  </h3>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {activeStage === 'verify'
                      ? 'Adversarial falsification experiments and minority recall verification'
                      : '101-point threshold sensitivity sweep and decision policy optimization'}
                  </p>
                </div>

                {completedInvestigationId ? (
                  <div className="alert alert-success" style={{ flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <CheckCircle2 size={16} />
                      <strong>Investigation Complete</strong>
                    </div>
                    <p style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
                      Results and falsification metrics are recorded in the persistent workspace.
                    </p>
                    <Link href={`/investigations/${completedInvestigationId}`} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)' }}>
                      Open Full Investigation Workspace
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                ) : (
                  <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    Falsification experiments and repair sweeps are executed during the investigation loop.
                    <br />
                    <button onClick={() => setActiveStage('ingest')} className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-4)' }}>
                      Return to Ingestion & Launch
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* STAGE 06: REPORT */}
            {activeStage === 'report' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Certified Incident Report
                  </h3>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    Deterministic cryptographic proof and decision repair policy
                  </p>
                </div>

                {completedInvestigationId ? (
                  <div style={{ padding: 'var(--space-6)', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                    <CheckCircle2 size={24} style={{ color: 'var(--status-success)', marginBottom: 'var(--space-2)' }} />
                    <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-2)' }}>
                      Incident Certified
                    </h4>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                      Investigation ID: {completedInvestigationId}. All diagnostic evidence, before-after re-evaluations, and repair policies are finalized.
                    </p>
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <Link href={`/investigations/${completedInvestigationId}`} className="btn btn-primary btn-sm">
                        View Complete Report
                      </Link>
                      <Link href={`/api/investigations/${completedInvestigationId}/pdf`} target="_blank" className="btn btn-secondary btn-sm">
                        Download PDF Report
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    No finalized investigation report yet. Run an investigation to generate a certified report.
                  </div>
                )}
              </div>
            )}

            {/* Mid-Turn Steering Directives (Visible across active stages) */}
            <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--border-default)' }}>
              <label htmlFor="steering-input" className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
                Mid-Turn User Steering Directives
              </label>
              <p className="form-helper" style={{ marginBottom: 'var(--space-3)' }}>
                Inject domain constraints (e.g. &quot;Focus on patient safety&quot;, &quot;Check calibration&quot;) without discarding gathered evidence.
              </p>

              <form onSubmit={handleAddDirective} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <input
                  id="steering-input"
                  type="text"
                  placeholder="e.g. Check calibration and Brier score..."
                  value={steeringInput}
                  onChange={(e) => setSteeringInput(e.target.value)}
                  className="input-control"
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-secondary btn-sm" disabled={!steeringInput.trim()}>
                  <Send size={12} />
                  Inject
                </button>
              </form>

              {activeDirectives.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {activeDirectives.map((d, i) => (
                    <span key={i} className="badge badge-accent" style={{ fontSize: '11px' }}>
                      Directive: {d}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Completion Callout */}
            {completedInvestigationId && (
              <div
                style={{
                  marginTop: 'var(--space-6)',
                  padding: 'var(--space-4)',
                  backgroundColor: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid var(--status-success-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--status-success)' }} />
                  <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                    Investigation Complete & Certified
                  </strong>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                  All 10 diagnostic tools, falsification experiments, and 101-point threshold repair before-after evaluations are recorded.
                </p>
                <Link
                  href={`/investigations/${completedInvestigationId}`}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                  Open Investigation Workspace
                  <ArrowRight size={13} />
                </Link>
              </div>
            )}

            {/* Minimized Telemetry Bar (Visible when telemetry panel is collapsed) */}
            {!telemetryOpen && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setTelemetryOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setTelemetryOpen(true);
                }}
                className="telemetry-minimized-bar"
                style={{ marginTop: 'var(--space-6)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Terminal size={14} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    astra-orchestrator-telemetry.log
                  </span>
                  <span className="badge badge-neutral" style={{ fontSize: '12px' }}>
                    {logs.length} events
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      color: isRunning ? 'var(--status-success)' : 'var(--text-muted)',
                    }}
                  >
                    {isRunning ? '● STREAMING LIVE' : '○ IDLE (Click to expand)'}
                  </span>
                  <Maximize2 size={13} style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Live Agentic Telemetry Console (Collapsible) */}
          {telemetryOpen && (
            <div
              className="card card-elevated console-terminal"
              style={{
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#05070c',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                height: '620px',
              }}
            >
              {/* Terminal Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Terminal size={14} style={{ color: '#64748b' }} />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: '#94a3b8',
                    }}
                  >
                    astra-orchestrator-telemetry.log
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      color: isRunning ? 'var(--status-success)' : '#94a3b8',
                    }}
                  >
                    {isRunning ? '● STREAMING LIVE' : '○ IDLE'}
                  </span>

                  <button
                    type="button"
                    onClick={() => setTelemetryOpen(false)}
                    className="btn-icon"
                    title="Minimize Astra console"
                    aria-label="Minimize Astra console"
                    style={{ color: '#94a3b8' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Terminal Output */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 'var(--space-4)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13.5px',
                  lineHeight: 1.6,
                  color: '#e6edf3',
                  backgroundColor: '#05070c',
                }}
              >
                {logs.length === 0 ? (
                  <div style={{ color: '#64748b', textAlign: 'center', paddingTop: 'var(--space-16)' }}>
                    Astra Orchestration Telemetry Terminal
                    <br />
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                      Click &quot;Launch Autonomous Investigation&quot; to begin streaming NDJSON events.
                    </span>
                  </div>
                ) : (
                  logs.map((log) => {
                    let color = '#9da5b4';
                    if (log.type === 'tool_call') color = '#58a6ff';
                    if (log.type === 'tool_result') color = '#7ee787';
                    if (log.type === 'hypothesis') color = '#d2a8ff';
                    if (log.type === 'experiment') color = '#ffa657';
                    if (log.type === 'repair') color = '#ff7b72';
                    if (log.type === 'diagnosis') color = '#38d39f';
                    if (log.type === 'error') color = '#ff5555';
                    if (log.type === 'steering') color = '#f1e05a';

                    return (
                      <div key={log.id} style={{ marginBottom: '4px', wordBreak: 'break-word' }}>
                        <span style={{ color: '#484f58', marginRight: '8px' }}>[{log.timestamp}]</span>
                        <span style={{ color }}>{log.message}</span>
                      </div>
                    );
                  })
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
