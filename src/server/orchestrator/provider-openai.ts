import type { InvestigatorProvider, ProviderTurnRequest, ProviderTurnResponse } from './provider.ts';
import { OfflineInvestigatorProvider } from './provider-offline.ts';
import type { ToolName } from '../../core/domain/tool-contracts.ts';

export class OpenAIInvestigatorProvider implements InvestigatorProvider {
  readonly name = 'openai_astra_investigator';
  private fallbackProvider = new OfflineInvestigatorProvider();
  private apiKey: string | null;
  private model: string;

  constructor(apiKey?: string, model = 'gpt-4o') {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? null;
    this.model = model;
  }

  async nextStep(request: ProviderTurnRequest): Promise<ProviderTurnResponse> {
    if (!this.apiKey) {
      // Deterministic fallback when no API key configured
      return this.fallbackProvider.nextStep(request);
    }

    try {
      const messages = this.buildPromptMessages(request);
      const tools = this.buildOpenAITools();

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        console.warn(`[OpenAI Provider] API returned status ${response.status}. Falling back to offline investigator.`);
        return this.fallbackProvider.nextStep(request);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              function: {
                name: string;
                arguments: string;
              };
            }>;
          };
        }>;
      };

      const choice = data.choices?.[0]?.message;
      if (!choice) {
        return this.fallbackProvider.nextStep(request);
      }

      // Check if model called a tool
      if (choice.tool_calls && choice.tool_calls.length > 0) {
        const toolCall = choice.tool_calls[0];
        const toolName = toolCall.function.name as ToolName;
        let toolInput: Record<string, unknown> = {};
        try {
          toolInput = JSON.parse(toolCall.function.arguments);
        } catch {
          toolInput = {};
        }

        return {
          action: 'call_tool',
          tool: toolName,
          input: toolInput,
          rationale: choice.content ?? `Dispatched ${toolName} to gather verifiable diagnostic evidence.`,
        };
      }

      // If model provided text without a tool call, treat as conclusion or hypothesis
      const content = choice.content ?? '';
      if (content.toLowerCase().includes('hypothesis:') && request.investigation.hypotheses.length === 0) {
        return {
          action: 'propose_hypothesis',
          statement: content.replace(/hypothesis:/i, '').trim(),
          confidenceLevel: 'limited',
          confidenceRationale: 'Hypothesis formulated based on observed model evaluation behavior.',
        };
      }

      return {
        action: 'conclude',
        rootCause: content,
        summary: content,
        primaryHypothesisId: request.investigation.hypotheses[0]?.id,
        confidenceLevel: 'strong',
        confidenceRationale: 'Concluded from evidence gathered during autonomous multi-turn diagnostic loop.',
        limitations: ['Verified on observed evaluation data.'],
      };
    } catch (err) {
      console.warn('[OpenAI Provider] Error connecting to OpenAI API. Falling back to offline investigator.', err);
      return this.fallbackProvider.nextStep(request);
    }
  }

  private buildPromptMessages(request: ProviderTurnRequest) {
    const { investigation, dataset, userDirectives } = request;

    const systemPrompt = `You are Astra, the lead ML reliability investigator in WhyLab.
Your task is to investigate machine learning failure modes, formulate falsifiable hypotheses, test them with diagnostic lab instruments, and determine optimal repairs.

STRICT CONSTRAINTS:
1. ZERO FABRICATION OF NUMBERS: You must NEVER invent metrics, p-values, or distributions. All numerical values must come exclusively from WhyLab's deterministic diagnostic tools.
2. FALSIFICATION FIRST: Before diagnosing a failure mode, you must attempt to disprove or substantiate your hypothesis via counterfactual experiments.
3. REPAIR CANDIDATES: When a failure is confirmed, generate and re-evaluate repair candidates on identical evaluation data before concluding.

CURRENT DATASET:
- Name: ${dataset.metadata.name}
- Rows: ${dataset.metadata.rowCount}
- Columns: ${dataset.metadata.columns.join(', ')}
- Task: ${dataset.metadata.task}

GATHERED EVIDENCE ITEMS: ${investigation.evidence.length}
PROPOSED HYPOTHESES: ${investigation.hypotheses.length}
EXPERIMENTS CONDUCTED: ${investigation.experiments.length}
REPAIRS PROPOSED: ${investigation.repairs.length}
`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (userDirectives.length > 0) {
      messages.push({
        role: 'user',
        content: `User Directives & Steering:\n${userDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n')}`,
      });
    }

    // Include recent history context
    const recentEvents = investigation.events.slice(-8);
    if (recentEvents.length > 0) {
      messages.push({
        role: 'user',
        content: `Investigation state update:\n${recentEvents.map((e) => `[${e.kind}] ${e.message}`).join('\n')}\nWhat is the next diagnostic step?`,
      });
    } else {
      messages.push({
        role: 'user',
        content: 'Begin the investigation by establishing baseline classification metrics and confusion matrix.',
      });
    }

    return messages;
  }

  private buildOpenAITools() {
    return [
      {
        type: 'function',
        function: {
          name: 'compute_classification_metrics',
          description: 'Calculates confusion matrix, accuracy, balanced accuracy, precision, recall, and AUCs.',
          parameters: {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              positiveLabel: { type: 'string' },
            },
            required: ['datasetId', 'positiveLabel'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'run_counterfactual_test',
          description: 'Runs exact counterfactual class reweighting to test for Accuracy Paradox distortion.',
          parameters: {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              positiveLabel: { type: 'string' },
              hypothesisId: { type: 'string' },
              method: { type: 'string', enum: ['accuracy_paradox'] },
              seed: { type: 'number' },
            },
            required: ['datasetId', 'positiveLabel', 'hypothesisId', 'method'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'generate_repair_candidate',
          description: 'Deterministically generates an optimal operating policy repair candidate based on recall or cost constraints.',
          parameters: {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              positiveLabel: { type: 'string' },
              hypothesisId: { type: 'string' },
              targetMetric: { type: 'string', enum: ['recall', 'balanced_accuracy', 'cost'] },
              targetValue: { type: 'number' },
            },
            required: ['datasetId', 'positiveLabel', 'hypothesisId', 'targetMetric'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 're_evaluate_repair',
          description: 'Evaluates proposed repair policy against baseline performance on identical rows.',
          parameters: {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              positiveLabel: { type: 'string' },
              repairId: { type: 'string' },
              baselineThreshold: { type: 'number' },
              repairedThreshold: { type: 'number' },
            },
            required: ['datasetId', 'positiveLabel', 'repairId', 'baselineThreshold', 'repairedThreshold'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'slice_evaluation',
          description: 'Evaluates performance breakdowns across metadata slice columns (site, group, device).',
          parameters: {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              positiveLabel: { type: 'string' },
              columns: { type: 'array', items: { type: 'string' } },
              minimumSampleSize: { type: 'number' },
            },
            required: ['datasetId', 'positiveLabel', 'columns', 'minimumSampleSize'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_calibration',
          description: 'Evaluates predicted probability calibration and Brier reliability score.',
          parameters: {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              positiveLabel: { type: 'string' },
              bins: { type: 'number' },
              strategy: { type: 'string', enum: ['equal_width', 'equal_frequency'] },
            },
            required: ['datasetId', 'positiveLabel', 'bins', 'strategy'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'threshold_sweep',
          description: 'Sweeps continuous classification decision thresholds across 101 operating cutoffs [0.00 - 1.00] to evaluate sensitivity, specificity, and confusion tradeoffs on the dataset.',
          parameters: {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              positiveLabel: { type: 'string' },
              thresholds: {
                type: 'array',
                items: { type: 'number' },
                description: 'Array of thresholds in [0, 1]. Pass 101 cutoffs from 0.00 to 1.00.',
              },
            },
            required: ['datasetId', 'positiveLabel', 'thresholds'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'scan_feature_leakage',
          description: 'Screens features for correlation anomalies and proxy target leakage.',
          parameters: {
            type: 'object',
            properties: {
              datasetId: { type: 'string' },
              targetColumn: { type: 'string' },
              featureColumns: { type: 'array', items: { type: 'string' } },
            },
            required: ['datasetId', 'targetColumn', 'featureColumns'],
          },
        },
      },
    ];
  }
}
