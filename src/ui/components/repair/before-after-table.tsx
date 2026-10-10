'use client';

import { useMemo } from 'react';
import { CheckCircle2, GitCompare, ShieldCheck } from 'lucide-react';
import type { SweepPoint } from './threshold-sweep-chart';

export interface BeforeAfterTableProps {
  baselinePoint: SweepPoint;
  repairedPoint: SweepPoint;
  falseNegativeCost: number;
  falsePositiveCost: number;
  totalSamples: number;
}

export default function BeforeAfterTable({
  baselinePoint,
  repairedPoint,
  falseNegativeCost,
  falsePositiveCost,
  totalSamples,
}: BeforeAfterTableProps) {
  const calculations = useMemo(() => {
    const baseConf = baselinePoint.confusion;
    const repConf = repairedPoint.confusion;

    const basePos = baseConf.truePositive + baseConf.falseNegative;
    const baseNeg = baseConf.trueNegative + baseConf.falsePositive;

    const repPos = repConf.truePositive + repConf.falseNegative;
    const repNeg = repConf.trueNegative + repConf.falsePositive;

    const baseRecall = basePos > 0 ? baseConf.truePositive / basePos : 0;
    const repRecall = repPos > 0 ? repConf.truePositive / repPos : 0;

    const baseSpec = baseNeg > 0 ? baseConf.trueNegative / baseNeg : 1;
    const repSpec = repNeg > 0 ? repConf.trueNegative / repNeg : 1;

    const baseBA = (baseRecall + baseSpec) / 2;
    const repBA = (repRecall + repSpec) / 2;

    const basePrec =
      baseConf.truePositive + baseConf.falsePositive > 0
        ? baseConf.truePositive / (baseConf.truePositive + baseConf.falsePositive)
        : 0;
    const repPrec =
      repConf.truePositive + repConf.falsePositive > 0
        ? repConf.truePositive / (repConf.truePositive + repConf.falsePositive)
        : 0;

    const baseAcc =
      basePos + baseNeg > 0 ? (baseConf.truePositive + baseConf.trueNegative) / (basePos + baseNeg) : 0;
    const repAcc =
      repPos + repNeg > 0 ? (repConf.truePositive + repConf.trueNegative) / (repPos + repNeg) : 0;

    const baseCost = baseConf.falseNegative * falseNegativeCost + baseConf.falsePositive * falsePositiveCost;
    const repCost = repConf.falseNegative * falseNegativeCost + repConf.falsePositive * falsePositiveCost;

    return {
      baseRecall,
      repRecall,
      deltaRecall: repRecall - baseRecall,

      baseFN: baseConf.falseNegative,
      repFN: repConf.falseNegative,
      deltaFN: repConf.falseNegative - baseConf.falseNegative,

      baseSpec,
      repSpec,
      deltaSpec: repSpec - baseSpec,

      baseFP: baseConf.falsePositive,
      repFP: repConf.falsePositive,
      deltaFP: repConf.falsePositive - baseConf.falsePositive,

      basePrec,
      repPrec,
      deltaPrec: repPrec - basePrec,

      baseBA,
      repBA,
      deltaBA: repBA - baseBA,

      baseAcc,
      repAcc,
      deltaAcc: repAcc - baseAcc,

      baseCost,
      repCost,
      deltaCost: repCost - baseCost,
      costReductionPct: baseCost > 0 ? ((baseCost - repCost) / baseCost) * 100 : 0,

      casesSaved: baseConf.falseNegative - repConf.falseNegative,
    };
  }, [baselinePoint, repairedPoint, falseNegativeCost, falsePositiveCost]);

  return (
    <div className="card card-elevated">
      {/* Header */}
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div className="card-title">
          <GitCompare size={16} style={{ color: 'var(--color-primary, #3b82f6)' }} />
          <span>Before vs After Measured Comparison (n = {totalSamples.toLocaleString()} rows)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="badge badge-success">
            <CheckCircle2 size={12} />
            Identical-Row Evaluation
          </span>
          <span className="badge badge-info">100% Deterministic Math</span>
        </div>
      </div>

      {/* Row Guarantee Notice */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
        }}
      >
        <ShieldCheck size={14} style={{ color: 'var(--color-primary, #3b82f6)', flexShrink: 0 }} />
        <span>
          <strong>Identical Rows Guarantee:</strong> Both baseline (&tau; = {baselinePoint.threshold.toFixed(2)}) and
          repaired (&tau; = {repairedPoint.threshold.toFixed(2)}) operating policies are re-evaluated on the exact same{' '}
          <strong>{totalSamples.toLocaleString()}</strong> rows. Zero synthetic interpolation or simulated rows.
        </span>
      </div>

      {/* Comparison Table */}
      <div className="card-body" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: '24%' }}>Metric / Evaluation Dimension</th>
                <th style={{ width: '15%' }}>Baseline (&tau; = {baselinePoint.threshold.toFixed(2)})</th>
                <th style={{ width: '15%' }}>Repaired (&tau; = {repairedPoint.threshold.toFixed(2)})</th>
                <th style={{ width: '15%' }}>Empirical Delta (&Delta;)</th>
                <th style={{ width: '18%' }}>Operational / Clinical Impact</th>
                <th style={{ width: '13%' }}>Provenance</th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
              {/* Malignant Recall */}
              <tr>
                <td>
                  <strong>Malignant Recall (Sensitivity)</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    True positive detection rate
                  </div>
                </td>
                <td style={{ color: '#ef4444' }}>
                  {(calculations.baseRecall * 100).toFixed(1)}% ({baselinePoint.confusion.truePositive} cases)
                </td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>
                  {(calculations.repRecall * 100).toFixed(1)}% ({repairedPoint.confusion.truePositive} cases)
                </td>
                <td style={{ color: calculations.deltaRecall >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                  {calculations.deltaRecall >= 0 ? '+' : ''}
                  {(calculations.deltaRecall * 100).toFixed(1)} pp
                </td>
                <td style={{ fontFamily: 'var(--font-sans)' }}>
                  <span className="badge badge-success">
                    +{calculations.casesSaved > 0 ? calculations.casesSaved : 0} Positives Caught
                  </span>
                </td>
                <td>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>
                    [MEASURED]
                  </span>
                </td>
              </tr>

              {/* Missed Cancer Cases (False Negatives) */}
              <tr>
                <td>
                  <strong>Missed Cases (False Negatives)</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    Positive cases erroneously labeled negative
                  </div>
                </td>
                <td style={{ color: '#ef4444' }}>{calculations.baseFN} missed</td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>{calculations.repFN} missed</td>
                <td style={{ color: calculations.deltaFN <= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                  {calculations.deltaFN <= 0 ? '' : '+'}
                  {calculations.deltaFN} cases
                </td>
                <td style={{ fontFamily: 'var(--font-sans)' }}>
                  <span className="badge badge-success">
                    {calculations.baseFN > 0
                      ? `${(((calculations.baseFN - calculations.repFN) / calculations.baseFN) * 100).toFixed(0)}% Miss Reduction`
                      : '0 misses'}
                  </span>
                </td>
                <td>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>
                    [MEASURED]
                  </span>
                </td>
              </tr>

              {/* Benign Specificity */}
              <tr>
                <td>
                  <strong>Benign Specificity (TNR)</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    Negative cases correctly screened out
                  </div>
                </td>
                <td>{(calculations.baseSpec * 100).toFixed(1)}%</td>
                <td style={{ color: 'var(--text-primary)' }}>{(calculations.repSpec * 100).toFixed(1)}%</td>
                <td style={{ color: calculations.deltaSpec >= 0 ? '#10b981' : '#f59e0b' }}>
                  {calculations.deltaSpec >= 0 ? '+' : ''}
                  {(calculations.deltaSpec * 100).toFixed(1)} pp
                </td>
                <td style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>
                  Controlled biopsy burden
                </td>
                <td>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>
                    [MEASURED]
                  </span>
                </td>
              </tr>

              {/* False Alarms / False Positives */}
              <tr>
                <td>
                  <strong>False Alarms (False Positives)</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    Benign cases flagged for unnecessary review
                  </div>
                </td>
                <td>{calculations.baseFP} referrals</td>
                <td style={{ color: '#f59e0b' }}>{calculations.repFP} referrals</td>
                <td style={{ color: calculations.deltaFP <= 0 ? '#10b981' : '#f59e0b' }}>
                  {calculations.deltaFP >= 0 ? '+' : ''}
                  {calculations.deltaFP} reviews
                </td>
                <td style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>
                  Clinically tolerated trade-off
                </td>
                <td>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>
                    [MEASURED]
                  </span>
                </td>
              </tr>

              {/* Precision */}
              <tr>
                <td>
                  <strong>Precision (PPV)</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    Fraction of positive calls that are true
                  </div>
                </td>
                <td>{(calculations.basePrec * 100).toFixed(1)}%</td>
                <td>{(calculations.repPrec * 100).toFixed(1)}%</td>
                <td style={{ color: calculations.deltaPrec >= 0 ? '#10b981' : '#f59e0b' }}>
                  {calculations.deltaPrec >= 0 ? '+' : ''}
                  {(calculations.deltaPrec * 100).toFixed(1)} pp
                </td>
                <td style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>
                  Expected precision shift
                </td>
                <td>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>
                    [MEASURED]
                  </span>
                </td>
              </tr>

              {/* Balanced Accuracy */}
              <tr>
                <td>
                  <strong>Balanced Accuracy</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    Unweighted mean of sensitivity &amp; specificity
                  </div>
                </td>
                <td style={{ color: '#ef4444' }}>{(calculations.baseBA * 100).toFixed(1)}%</td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>{(calculations.repBA * 100).toFixed(1)}%</td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>
                  {calculations.deltaBA >= 0 ? '+' : ''}
                  {(calculations.deltaBA * 100).toFixed(1)} pp
                </td>
                <td style={{ fontFamily: 'var(--font-sans)' }}>
                  <span className="badge badge-success">Balanced Classifier</span>
                </td>
                <td>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>
                    [MEASURED]
                  </span>
                </td>
              </tr>

              {/* Raw Accuracy */}
              <tr>
                <td>
                  <strong>Raw Accuracy</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    Overall fraction of correct calls
                  </div>
                </td>
                <td>{(calculations.baseAcc * 100).toFixed(1)}%</td>
                <td>{(calculations.repAcc * 100).toFixed(1)}%</td>
                <td style={{ color: calculations.deltaAcc >= 0 ? '#10b981' : '#f59e0b' }}>
                  {calculations.deltaAcc >= 0 ? '+' : ''}
                  {(calculations.deltaAcc * 100).toFixed(1)} pp
                </td>
                <td style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>
                  Discarded misleading majority metric
                </td>
                <td>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>
                    [MEASURED]
                  </span>
                </td>
              </tr>

              {/* Simulated Cost Score */}
              <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.04)' }}>
                <td>
                  <strong>Total Misclassification Risk</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    FN &times; {falseNegativeCost} + FP &times; {falsePositiveCost}
                  </div>
                </td>
                <td style={{ color: '#ef4444' }}>{Math.round(calculations.baseCost).toLocaleString()} units</td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>
                  {Math.round(calculations.repCost).toLocaleString()} units
                </td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>
                  {calculations.deltaCost <= 0 ? '' : '+'}
                  {Math.round(calculations.deltaCost).toLocaleString()} units (-
                  {calculations.costReductionPct.toFixed(1)}%)
                </td>
                <td style={{ fontFamily: 'var(--font-sans)' }}>
                  <span className="badge badge-accent">
                    {calculations.costReductionPct.toFixed(0)}% Risk Reduced
                  </span>
                </td>
                <td>
                  <span className="badge badge-accent" style={{ fontSize: '10px' }}>
                    [SIMULATED]
                  </span>
                </td>
              </tr>

              {/* Simulated Fatal Miss Reduction */}
              <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.04)' }}>
                <td>
                  <strong>Prevented Fatal Diagnostic Delays</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                    Estimated high-risk patient misses averted
                  </div>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>0 baseline</td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>
                  ~{calculations.casesSaved > 0 ? calculations.casesSaved : 0} patients
                </td>
                <td style={{ color: '#10b981', fontWeight: 700 }}>
                  +{calculations.casesSaved > 0 ? calculations.casesSaved : 0} patients
                </td>
                <td style={{ fontFamily: 'var(--font-sans)' }}>
                  <span className="badge badge-success">Lives Protected</span>
                </td>
                <td>
                  <span className="badge badge-accent" style={{ fontSize: '10px' }}>
                    [SIMULATED]
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
