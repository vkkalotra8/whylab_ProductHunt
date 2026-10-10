import { getInvestigation } from '@/core/investigation/store';
import { runFlagshipMelanomaInvestigation } from '@/core/diagnostics/flagship-melanoma';
import EvidenceWorkspace from '@/ui/components/evidence/evidence-workspace';
import { AlertTriangle } from 'lucide-react';

export default async function InvestigationEvidencePage({
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

  return <EvidenceWorkspace investigation={investigation} />;
}
