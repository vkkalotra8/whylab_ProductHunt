'use client';

import React, { useState } from 'react';
import type { VisionRecord } from '@/core/domain/vision-types';
import { runAutonomousVisionInvestigation, type VisionInvestigationState } from '@/server/orchestrator/vision-investigator';

interface AutonomousInvestigationViewProps {
  records: VisionRecord[];
  datasetName: string;
}

export function AutonomousInvestigationView({
  records,
  datasetName,
}: AutonomousInvestigationViewProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [state, setState] = useState<VisionInvestigationState | null>(null);

  async function handleRunInvestigation() {
    setIsRunning(true);
    try {
      const result = await runAutonomousVisionInvestigation(records, {
        datasetName,
        maxRounds: 5,
      });
      setState(result);
    } catch (err) {
      console.error('Autonomous investigation failed:', err);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Orchestrator Banner & Trigger */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/60 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded font-bold uppercase bg-indigo-600 text-white shadow-sm">
              ASTRA MULTI-MODAL ORCHESTRATOR
            </span>
            <span className="text-xs text-indigo-300 font-mono">Autonomous Reasoning Loop</span>
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Autonomous Computer Vision Failure Investigation
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Astra will autonomously execute allowlisted diagnostic tools, inspect cross-split near-duplicate leakage,
            evaluate optical blur drift across sites, and detect spurious shortcut learning.
          </p>
        </div>

        <button
          onClick={handleRunInvestigation}
          disabled={isRunning || records.length === 0}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isRunning ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span>Orchestrating Diagnostics...</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>Run Autonomous Investigation</span>
            </>
          )}
        </button>
      </div>

      {state && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Executive Certified Diagnosis Card */}
          {state.diagnosis && (
            <div className="bg-slate-900/90 border border-emerald-600/50 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase text-emerald-400 tracking-wider font-mono">
                    Astra Certified Diagnosis (ID: {state.diagnosis.id})
                  </span>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Confidence: <strong className="text-emerald-300 uppercase">{state.diagnosis.confidence.level}</strong>
                </span>
              </div>

              <p className="text-sm text-white font-medium leading-relaxed mb-4">
                {state.diagnosis.summary}
              </p>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Evidence Artifacts Linked:</span>
                  <span className="text-indigo-400 font-bold">{state.diagnosis.evidenceIds.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Formulated Hypotheses:</span>
                  <span className="text-teal-400 font-bold">{state.diagnosis.hypothesisIds.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Investigation Rounds:</span>
                  <span className="text-white font-bold">{state.roundsCompleted} turns</span>
                </div>
              </div>
            </div>
          )}

          {/* Formulated Hypotheses Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Formulated Hypotheses &amp; Falsification Proofs
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {state.hypotheses.map((hyp, i) => (
                <div
                  key={hyp.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase">
                        Hypothesis 0{i + 1}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {hyp.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 font-medium mb-3">{hyp.statement}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                    <span className="text-slate-500 block mb-0.5">Rationale:</span>
                    <span className="italic leading-snug">{hyp.confidence.rationale}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Executed Tool Calls & Evidence DAG */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Executed Tool Call Sequence &amp; Evidence Nodes
            </h4>

            <div className="space-y-3">
              {state.toolResults.map((tr, i) => {
                const call = state.toolCalls[i];
                return (
                  <div
                    key={tr.id}
                    className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 flex items-center justify-center font-bold text-[10px]">
                        {i + 1}
                      </span>
                      <div>
                        <span className="font-bold text-white">{tr.tool}</span>
                        <span className="text-slate-500 block text-[10px]">Call ID: {call?.id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-slate-400 text-[11px]">
                          {tr.evidenceIds.length} Evidence Node{tr.evidenceIds.length === 1 ? '' : 's'}
                        </span>
                        <span className="text-emerald-400 block text-[10px] font-bold">COMPLETED</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
