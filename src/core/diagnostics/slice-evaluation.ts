import { computeClassificationMetrics, evaluateClassification } from './classification-metrics.ts';
import type { EvaluationDataset, EvaluationRow } from './evaluation-ingestion.ts';
import { toolSchemas, type ToolInput, type ToolOutput } from '../domain/tool-contracts.ts';
import { fail } from '../domain/schema.ts';
import type { Measurement } from '../domain/primitives.ts';

export type SliceEvaluationReport = {
  output: ToolOutput<'slice_evaluation'>;
  coverage: { column: string; groupedRows: number; missingRows: number; invalidRows: number }[];
  limitations: string[];
};


function utcDay(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/);
  if (!match) return null;
  const canonical = match[1] + '.' + (match[2] ?? '').padEnd(3, '0') + 'Z';
  const time = Date.parse(canonical);
  return Number.isFinite(time) && new Date(time).toISOString() === canonical
    ? canonical.slice(0, 10)
    : null;
}

/** Independent one-column slices, compared with the entire supplied evaluation population. */
export function evaluateSlices(
  data: EvaluationDataset,
  input: ToolInput<'slice_evaluation'>
): SliceEvaluationReport {
  const request = toolSchemas.slice_evaluation.input.parse(input);

  for (const column of request.columns) {
    if (!data.metadata.columns.includes(column)) {
      fail('$.columns', `column '${column}' is absent from dataset metadata`);
    }
    if (
      column === data.metadata.targetColumn ||
      column === data.metadata.predictionColumn ||
      column === data.metadata.probabilityColumn
    ) {
      fail('$.columns', `cannot slice by evaluation target or prediction column '${column}'`);
    }
  }

  const overall = evaluateClassification(data, {
    datasetId: request.datasetId,
    positiveLabel: request.positiveLabel,
  });

  if (!data.rows.length) fail('$.rows', 'slice evaluation requires at least one row');

  const slices: ToolOutput<'slice_evaluation'>['slices'] = [];
  const coverage: SliceEvaluationReport['coverage'] = [];
  const overallMetrics = new Map(overall.output.metrics.map((m) => [m.name, m]));

  for (const column of request.columns) {
    const groups = new Map<string, EvaluationRow[]>();
    let missingRows = 0,
      invalidRows = 0;

    for (const row of data.rows) {
      if (!row.attributes || !Object.hasOwn(row.attributes, column)) {
        fail('$.rows.attributes', 'selected metadata is absent from a normalized row');
      }
      const raw = row.attributes[column];
      if (raw === null) {
        missingRows++;
        continue;
      }
      if (typeof raw !== 'string' || !raw.trim()) {
        fail('$.rows.attributes', 'expected normalized text or null metadata');
      }
      const value = column === 'timestamp' ? utcDay(raw) : raw;
      if (value === null) {
        invalidRows++;
        continue;
      }
      const group = groups.get(value) ?? [];
      group.push(row);
      groups.set(value, group);
      if (groups.size > 100) {
        fail(
          '$.columns',
          'a selected column exceeds 100 slices; supply coarser metadata or a narrower evaluation population'
        );
      }
    }

    coverage.push({
      column,
      groupedRows: data.rows.length - missingRows - invalidRows,
      missingRows,
      invalidRows,
    });

    for (const value of [...groups.keys()].sort()) {
      const rows = groups.get(value)!;
      const mappedRows = rows.map((r) => ({
        actual: r.actual ?? '',
        predicted: r.predicted ?? '',
        positiveProbability: r.positiveProbability,
      }));
      const report = computeClassificationMetrics({ labels: data.labels, rows: mappedRows });
      const deltas: Measurement[] = report.output.metrics.map((metric) => {
        const reference = overallMetrics.get(metric.name)!;
        const base = {
          name: `${metric.name}_delta_vs_overall`,
          unit: 'percentage_points' as const,
          sampleSize: rows.length,
        };
        if (metric.name === 'minority_recall') {
          return {
            ...base,
            status: 'undefined' as const,
            reason: 'Minority class identity may differ; compare positive recall and specificity instead.',
          };
        }
        if (metric.status !== 'measured' || reference.status !== 'measured') {
          return {
            ...base,
            status: 'undefined' as const,
            reason: 'Slice or overall measurement is undefined.',
          };
        }
        return {
          ...base,
          status: 'measured' as const,
          value: (metric.value - reference.value) * 100,
        };
      });

      const limitations = [
        ...report.limitations,
        'Differences compare this slice with the overall population, which includes this slice; they are descriptive, not significance tests.',
      ];
      if (rows.length < request.minimumSampleSize) {
        limitations.push(
          `Insufficient sample size: ${rows.length} rows is below the requested minimum ${request.minimumSampleSize}. Metrics remain descriptive and must not support strong conclusions.`
        );
      }
      if (missingRows || invalidRows) {
        limitations.push(
          `${missingRows} missing and ${invalidRows} invalid ${column} values are excluded from grouping but retained in overall metrics.`
        );
      }

      slices.push({
        column,
        value,
        sampleSize: rows.length,
        metrics: [...report.output.metrics, ...deltas],
        limitations,
      });
    }
  }

  const limitations = [
    'Slices are computed independently per metadata column; counts across different columns must not be summed.',
    'Missing/invalid metadata remains in overall metrics and is reported in coverage; no synthetic missing-value category is created.',
    'Timestamp slices use UTC calendar days and accept explicit UTC ISO timestamps only.',
    'At most 100 groups per selected column; excess cardinality is rejected rather than silently truncated.',
  ];
  for (const c of coverage) {
    if (!c.groupedRows) limitations.push(`${c.column}: no usable metadata; no slices were generated.`);
  }

  return {
    output: toolSchemas.slice_evaluation.output.parse({ overall: overall.output, slices }),
    coverage,
    limitations,
  };
}
