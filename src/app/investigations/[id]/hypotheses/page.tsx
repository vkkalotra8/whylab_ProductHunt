import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getInvestigation, getInvestigationCsv } from '@/core/investigation/store';
import { runFlagshipMelanomaInvestigation } from '@/core/diagnostics/flagship-melanoma';
import { rankHypothesesFromInvestigation } from '@/core/falsification/hypothesis-ranker';
import { runAdversarialReview } from '@/core/falsification/adversarial-review';
import { ingestEvaluationCsv, type EvaluationDataset } from '@/core/diagnostics/evaluation-ingestion';
import { AdversarialWorkbench } from '@/ui/components/falsification/adversarial-workbench';
import { AlertTriangle } from 'lucide-react';

export default async function InvestigationHypothesesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let investigation = getInvestigation(id);

  if (!investigation) {
    try {
      investigation = runFlagshipMelanomaInvestigation();
    } catch {
      // Fallback
    }
  }

  if (!investigation) {
    return (
      <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <AlertTriangle size={32} style={{ color: 'var(--status-warning)', margin: '0 auto var(--space-3)' }} />
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Investigation Not Found</h2>
      </div>
    );
  }

  const rankedHypotheses = rankHypothesesFromInvestigation(investigation);

  // Ingest matching dataset for adversarial challenge battery
  const customCsv = getInvestigationCsv(id);
  const targetDs = investigation.datasets[0];
  let dataset: EvaluationDataset | null = null;

  if (customCsv && targetDs) {
    try {
      dataset = ingestEvaluationCsv(customCsv, targetDs.name, {
        columnMapping: {
          targetColumn: targetDs.targetColumn ?? undefined,
          predictionColumn: targetDs.predictionColumn ?? undefined,
          probabilityColumn: targetDs.probabilityColumn,
        },
      });
    } catch {
      // Fall through to fixture loading
    }
  }

  if (!dataset) {
    const fixturesDir = join(process.cwd(), 'public', 'fixtures');
    let fixtureFile = 'melanoma-synthetic.csv';

    const firstDatasetName = targetDs?.name ?? '';
    if (firstDatasetName.includes('site')) {
      fixtureFile = 'site-failure.csv';
    } else if (firstDatasetName.includes('overconfident')) {
      fixtureFile = 'overconfident-classifier.csv';
    }

    const fixturePath = join(fixturesDir, fixtureFile);
    try {
      const csvContent = existsSync(fixturePath)
        ? readFileSync(fixturePath, 'utf8')
        : readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');

      dataset = ingestEvaluationCsv(csvContent, fixtureFile, {
        labels: { positive: '1', negative: '0' },
      });
    } catch {
      const csvContent = readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');
      dataset = ingestEvaluationCsv(csvContent, 'melanoma-synthetic.csv', {
        labels: { positive: '1', negative: '0' },
      });
    }
  }

  const auditReport = runAdversarialReview({ dataset, investigation });

  return (
    <AdversarialWorkbench
      investigation={investigation}
      auditReport={auditReport}
      rankedHypotheses={rankedHypotheses}
    />
  );
}
