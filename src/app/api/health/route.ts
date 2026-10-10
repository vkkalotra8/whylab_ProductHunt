export const runtime = 'nodejs';

export async function GET() {
  return Response.json(
    {
      status: 'healthy',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      capabilities: {
        deterministicEngine: 'ready',
        toolCount: 10,
        tools: [
          'profile_dataset',
          'compute_classification_metrics',
          'threshold_sweep',
          'check_calibration',
          'scan_feature_leakage',
          'slice_evaluation',
          'run_drift_tests',
          'run_counterfactual_test',
          'generate_repair_candidate',
          're_evaluate_repair',
        ],
        aiConfigured: Boolean(process.env.WHYLAB_AI_ENABLED === 'true' && process.env.OPENAI_API_KEY),
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
