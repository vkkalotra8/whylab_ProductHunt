import { GoogleGenAI } from '@google/genai';
import type {
  InvestigatorProvider,
  ProviderTurnRequest,
  ProviderTurnResponse,
  TokenUsage,
} from './provider.ts';
import { OfflineInvestigatorProvider } from './provider-offline.ts';
import type { ToolName } from '../../core/domain/tool-contracts.ts';
import type { EvaluationDataset } from '../../core/diagnostics/evaluation-ingestion.ts';
import { redactSecrets } from './ai-config.ts';

export interface GeminiProviderOptions {
  client?: any;
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export class GeminiInvestigatorProvider implements InvestigatorProvider {
  readonly name = 'gemini_astra_investigator';
  readonly model: string;
  private apiKey: string | null;
  private client: any;
  private fallbackProvider = new OfflineInvestigatorProvider();
  private maxRetries: number;
  private timeoutMs: number;
  private maxOutputTokens: number;
  private temperature: number;
  private cumulativeUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private lastUsage: TokenUsage | null = null;
  private isExecuting = false;

  constructor(apiKey?: string, options: GeminiProviderOptions = {}) {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? null;
    this.model = options.model ?? (process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash');
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxOutputTokens = options.maxOutputTokens ?? 1024;
    this.temperature = options.temperature ?? 0.1;

    if (options.client) {
      this.client = options.client;
    } else if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.client = null;
    }
  }

  getLastUsage(): TokenUsage | null {
    return this.lastUsage;
  }

  getCumulativeUsage(): TokenUsage {
    return { ...this.cumulativeUsage };
  }

  async nextStep(request: ProviderTurnRequest): Promise<ProviderTurnResponse> {
    if (!this.apiKey && !this.client) {
      console.warn('[Gemini Provider] No API key configured. Falling back to offline deterministic investigator.');
      return this.fallbackProvider.nextStep(request);
    }

    // Safeguard: single-turn concurrency mutex per provider instance
    if (this.isExecuting) {
      await new Promise((r) => setTimeout(r, 100));
    }
    this.isExecuting = true;

    try {
      const response = await this.executeWithRetry(request);
      return response;
    } catch (err: unknown) {
      const errorMsg = redactSecrets(err instanceof Error ? err.message : String(err));
      console.warn(`[Gemini Provider] Execution error: ${errorMsg}. Falling back to offline investigator.`);
      return this.fallbackProvider.nextStep(request);
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Discovers available models using supported API capabilities when configured model is unavailable.
   */
  async discoverAvailableModels(): Promise<string[]> {
    if (!this.client || !this.client.models?.list) {
      return ['gemini-2.5-flash', 'gemini-2.0-flash'];
    }
    try {
      const listResponse = await this.client.models.list();
      const models: string[] = [];
      if (Symbol.asyncIterator in Object(listResponse)) {
        for await (const m of listResponse) {
          if (m?.name) models.push(m.name.replace(/^models\//, ''));
        }
      } else if (Array.isArray(listResponse)) {
        for (const m of listResponse) {
          if (m?.name) models.push(m.name.replace(/^models\//, ''));
        }
      }
      return models.filter((m) => m.toLowerCase().includes('flash'));
    } catch {
      return ['gemini-2.5-flash', 'gemini-2.0-flash'];
    }
  }

  private async executeWithRetry(request: ProviderTurnRequest): Promise<ProviderTurnResponse> {
    const { dataset } = request;
    const systemInstruction = this.buildSystemInstruction(dataset, request);
    const contents = this.buildContents(request);
    const tools = this.buildGeminiTools(dataset);

    let lastError: Error | null = null;
    const maxAttempts = 1 + this.maxRetries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const timeoutController = new AbortController();
        const timeoutTimer = setTimeout(() => {
          timeoutController.abort(new Error(`Gemini request timed out after ${this.timeoutMs}ms.`));
        }, this.timeoutMs);

        try {
          const geminiResponse = await this.client.models.generateContent({
            model: this.model,
            contents,
            config: {
              systemInstruction,
              tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
              temperature: this.temperature,
              maxOutputTokens: this.maxOutputTokens,
            },
          });

          return await this.processGeminiResponse(geminiResponse, request);
        } finally {
          clearTimeout(timeoutTimer);
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const normalizedMsg = redactSecrets(lastError.message);

        // Check for non-retryable errors
        const isAuthError =
          normalizedMsg.includes('API_KEY_INVALID') ||
          normalizedMsg.includes('401') ||
          normalizedMsg.includes('403') ||
          normalizedMsg.includes('UNAUTHENTICATED');

        const isModelNotFoundError =
          normalizedMsg.includes('404') ||
          normalizedMsg.includes('NOT_FOUND') ||
          normalizedMsg.includes('is not found');

        if (isAuthError) {
          throw new Error(
            `Gemini Authentication Error: Invalid or unauthorized GEMINI_API_KEY. Please verify your credentials in .env.local.`
          );
        }

        if (isModelNotFoundError) {
          let discovered: string[] = [];
          try {
            discovered = await this.discoverAvailableModels();
          } catch {
            // ignore discovery errors
          }
          const recommendation = discovered.length > 0 ? discovered[0] : 'gemini-2.5-flash';
          throw new Error(
            `Configured Gemini model "${this.model}" is unavailable for this project/region. Actual API error: ${normalizedMsg}. Compatible alternative recommendation: "${recommendation}". Do not silently change the model without updating GEMINI_MODEL.`
          );
        }

        const isRateLimit =
          normalizedMsg.includes('429') ||
          normalizedMsg.includes('RESOURCE_EXHAUSTED') ||
          normalizedMsg.includes('rate limit');

        if (attempt < maxAttempts - 1) {
          // Bounded exponential backoff with jitter
          const baseDelay = isRateLimit ? 2000 : 1000;
          const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 500, 8000);
          console.warn(`[Gemini Provider] Attempt ${attempt + 1} failed: ${normalizedMsg}. Retrying in ${Math.round(delay)}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          if (isRateLimit) {
            throw new Error(
              `Gemini Free Tier Quota / Rate Limit Exceeded (429 RESOURCE_EXHAUSTED). Free tier has bounded requests per minute/day. Please wait before retrying.`
            );
          }
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error('Gemini request failed after all retry attempts.');
  }

  private async processGeminiResponse(
    response: any,
    request: ProviderTurnRequest
  ): Promise<ProviderTurnResponse> {
    // 1. Extract Token Usage
    if (response?.usageMetadata) {
      const prompt = response.usageMetadata.promptTokenCount ?? 0;
      const completion = response.usageMetadata.candidatesTokenCount ?? 0;
      const total = response.usageMetadata.totalTokenCount ?? prompt + completion;

      this.lastUsage = {
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total,
      };

      this.cumulativeUsage = {
        promptTokens: this.cumulativeUsage.promptTokens + prompt,
        completionTokens: this.cumulativeUsage.completionTokens + completion,
        totalTokens: this.cumulativeUsage.totalTokens + total,
      };
    }

    // 2. Safe handling of empty or malformed responses
    if (!response) {
      return await this.fallbackProvider.nextStep(request);
    }

    // 3. Extract Function Calls
    let functionCalls: any[] = [];
    if (Array.isArray(response.functionCalls) && response.functionCalls.length > 0) {
      functionCalls = response.functionCalls;
    } else if (response.candidates?.[0]?.content?.parts) {
      const parts = response.candidates[0].content.parts;
      functionCalls = parts
        .filter((p: any) => p && typeof p === 'object' && p.functionCall)
        .map((p: any) => p.functionCall);
    }

    if (functionCalls.length > 0) {
      const toolCall = functionCalls[0];
      const rawName = toolCall.name ?? '';
      const toolName = rawName as ToolName;

      // Validate against allowlisted tools
      if (!request.availableTools.includes(toolName)) {
        console.warn(`[Gemini Provider] Model attempted unauthorized tool invocation: "${rawName}". Falling back to offline.`);
        return await this.fallbackProvider.nextStep(request);
      }

      let toolInput: Record<string, unknown> = {};
      if (toolCall.args && typeof toolCall.args === 'object') {
        toolInput = { ...toolCall.args };
      } else if (typeof toolCall.args === 'string') {
        try {
          toolInput = JSON.parse(toolCall.args);
        } catch {
          toolInput = {};
        }
      }

      const textRationale = typeof response.text === 'string' ? response.text : undefined;

      return {
        action: 'call_tool',
        tool: toolName,
        input: toolInput,
        rationale: textRationale ?? `Dispatched ${toolName} to gather verifiable diagnostic evidence.`,
        usage: this.lastUsage ?? undefined,
        provider: this.name,
        model: this.model,
      };
    }

    // 4. Extract Text Content
    let content = '';
    if (typeof response.text === 'string') {
      content = response.text;
    } else if (response.candidates?.[0]?.content?.parts) {
      content = response.candidates[0].content.parts
        .filter((p: any) => p?.text)
        .map((p: any) => p.text)
        .join('\n');
    }

    content = content.trim();

    if (!content) {
      // Empty text response, fall back safely
      return await this.fallbackProvider.nextStep(request);
    }

    // 5. Check if proposing hypothesis
    if (content.toLowerCase().includes('hypothesis:') && request.investigation.hypotheses.length === 0) {
      const statement = content.replace(/hypothesis:/i, '').trim();
      return {
        action: 'propose_hypothesis',
        statement,
        confidenceLevel: 'limited',
        confidenceRationale: 'Hypothesis formulated by Gemini based on observed model evaluation behavior.',
        usage: this.lastUsage ?? undefined,
        provider: this.name,
        model: this.model,
      };
    }

    // 6. Conclude
    return {
      action: 'conclude',
      rootCause: content,
      summary: content,
      primaryHypothesisId: request.investigation.hypotheses[0]?.id,
      confidenceLevel: 'strong',
      confidenceRationale: 'Concluded from evidence gathered during autonomous multi-turn diagnostic loop.',
      limitations: ['Verified on observed evaluation data.'],
      usage: this.lastUsage ?? undefined,
      provider: this.name,
      model: this.model,
    };
  }

  private buildSystemInstruction(dataset: EvaluationDataset, request: ProviderTurnRequest): string {
    const { investigation } = request;
    return `You are Astra, the lead ML reliability investigator in WhyLab.
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
  }

  private buildContents(request: ProviderTurnRequest): any[] {
    const { investigation, dataset, userDirectives, history } = request;
    const contents: any[] = [];

    // Initial user prompt introducing task and directives
    let initialPrompt = dataset.metadata.predictionColumn
      ? 'Begin the investigation by establishing baseline classification metrics and confusion matrix.'
      : 'Begin the investigation by profiling dataset distributions, missingness rates, and feature cardinalities.';

    if (userDirectives.length > 0) {
      initialPrompt += `\n\nUser Directives & Steering:\n${userDirectives.map((d, i) => `${i + 1}. ${d}`).join('\n')}`;
    }

    contents.push({
      role: 'user',
      parts: [{ text: initialPrompt }],
    });

    // Process multi-turn history into paired model functionCall -> user functionResponse
    let pendingCall: any = null;

    for (const entry of history) {
      if (entry.kind === 'tool_call' && 'call' in entry.data) {
        pendingCall = entry.data.call;
        contents.push({
          role: 'model',
          parts: [
            {
              functionCall: {
                name: pendingCall.tool,
                args: pendingCall.input,
              },
            },
          ],
        });
      } else if (entry.kind === 'tool_result' && 'result' in entry.data && pendingCall) {
        const result = entry.data.result;
        // Truncate/sanitize response payload to fit within Free-tier token budget
        const sanitizedOutput = this.sanitizeToolOutput(result);

        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: pendingCall.tool,
                response: {
                  status: result.status,
                  output: sanitizedOutput,
                },
              },
            },
          ],
        });
        pendingCall = null;
      }
    }

    // Add recent events context if multi-turn has progressed
    const recentEvents = investigation.events.slice(-6);
    if (recentEvents.length > 0 && (!pendingCall || contents[contents.length - 1]?.role !== 'user')) {
      contents.push({
        role: 'user',
        parts: [
          {
            text: `Investigation state update:\n${recentEvents.map((e) => `[${e.kind}] ${e.message}`).join('\n')}\nWhat is the next diagnostic step?`,
          },
        ],
      });
    }

    return contents;
  }

  private sanitizeToolOutput(result: any): Record<string, unknown> {
    if (!result || !result.output) return { status: result?.status ?? 'completed' };

    const raw = result.output;
    // If output has large threshold sweep arrays, keep essential points
    if (Array.isArray(raw.points) && raw.points.length > 10) {
      return {
        ...raw,
        pointsCount: raw.points.length,
        optimalCutoff: raw.optimalCutoff,
        baselineCutoff: raw.baselineCutoff,
        points: [
          raw.points[0],
          raw.points[Math.floor(raw.points.length / 2)],
          raw.points[raw.points.length - 1],
        ],
      };
    }

    // Safe size guard (max ~3KB JSON)
    try {
      const json = JSON.stringify(raw);
      if (json.length > 3072) {
        return { summary: 'Output preserved in deterministic store', preview: json.slice(0, 1024) };
      }
    } catch {
      // ignore serialization error
    }

    return raw;
  }

  private buildGeminiTools(dataset?: EvaluationDataset): any[] {
    const allTools = [
      {
        name: 'profile_dataset',
        description: 'Profiles structural distributions, missingness rates, distinct counts, and class balance across dataset columns.',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            targetColumn: { type: 'STRING' },
          },
          required: ['datasetId'],
        },
      },
      {
        name: 'compute_classification_metrics',
        description: 'Calculates confusion matrix, accuracy, balanced accuracy, precision, recall, and AUCs.',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            positiveLabel: { type: 'STRING' },
          },
          required: ['datasetId', 'positiveLabel'],
        },
      },
      {
        name: 'run_counterfactual_test',
        description: 'Runs exact counterfactual class reweighting to test for Accuracy Paradox distortion.',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            positiveLabel: { type: 'STRING' },
            hypothesisId: { type: 'STRING' },
            method: { type: 'STRING', enum: ['accuracy_paradox'] },
            seed: { type: 'NUMBER' },
          },
          required: ['datasetId', 'positiveLabel', 'hypothesisId', 'method'],
        },
      },
      {
        name: 'generate_repair_candidate',
        description: 'Deterministically generates an optimal operating policy repair candidate based on recall or cost constraints.',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            positiveLabel: { type: 'STRING' },
            hypothesisId: { type: 'STRING' },
            targetMetric: { type: 'STRING', enum: ['recall', 'balanced_accuracy', 'cost'] },
            targetValue: { type: 'NUMBER' },
          },
          required: ['datasetId', 'positiveLabel', 'hypothesisId', 'targetMetric'],
        },
      },
      {
        name: 're_evaluate_repair',
        description: 'Evaluates proposed repair policy against baseline performance on identical rows.',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            positiveLabel: { type: 'STRING' },
            repairId: { type: 'STRING' },
            baselineThreshold: { type: 'NUMBER' },
            repairedThreshold: { type: 'NUMBER' },
          },
          required: ['datasetId', 'positiveLabel', 'repairId', 'baselineThreshold', 'repairedThreshold'],
        },
      },
      {
        name: 'slice_evaluation',
        description: 'Evaluates performance breakdowns across metadata slice columns (site, group, device).',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            positiveLabel: { type: 'STRING' },
            columns: { type: 'ARRAY', items: { type: 'STRING' } },
            minimumSampleSize: { type: 'NUMBER' },
          },
          required: ['datasetId', 'positiveLabel', 'columns', 'minimumSampleSize'],
        },
      },
      {
        name: 'check_calibration',
        description: 'Evaluates predicted probability calibration and Brier reliability score.',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            positiveLabel: { type: 'STRING' },
            bins: { type: 'NUMBER' },
            strategy: { type: 'STRING', enum: ['equal_width', 'equal_frequency'] },
          },
          required: ['datasetId', 'positiveLabel', 'bins', 'strategy'],
        },
      },
      {
        name: 'threshold_sweep',
        description: 'Sweeps continuous classification decision thresholds across 101 operating cutoffs [0.00 - 1.00] to evaluate sensitivity, specificity, and confusion tradeoffs on the dataset.',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            positiveLabel: { type: 'STRING' },
            thresholds: {
              type: 'ARRAY',
              items: { type: 'NUMBER' },
              description: 'Array of thresholds in [0, 1]. Pass 101 cutoffs from 0.00 to 1.00.',
            },
          },
          required: ['datasetId', 'positiveLabel', 'thresholds'],
        },
      },
      {
        name: 'scan_feature_leakage',
        description: 'Screens features for correlation anomalies and proxy target leakage.',
        parameters: {
          type: 'OBJECT',
          properties: {
            datasetId: { type: 'STRING' },
            targetColumn: { type: 'STRING' },
            featureColumns: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['datasetId', 'targetColumn', 'featureColumns'],
        },
      },
      {
        name: 'run_drift_tests',
        description: 'Evaluates distribution shift and covariate drift across metadata partitions or comparison datasets.',
        parameters: {
          type: 'OBJECT',
          properties: {
            referenceDatasetId: { type: 'STRING' },
            comparisonDatasetId: { type: 'STRING' },
            columns: { type: 'ARRAY', items: { type: 'STRING' } },
            method: { type: 'STRING', enum: ['ks', 'psi', 'wasserstein'] },
            bins: { type: 'NUMBER' },
          },
          required: ['referenceDatasetId', 'comparisonDatasetId', 'columns', 'method'],
        },
      },
    ];

    if (dataset && !dataset.metadata.predictionColumn) {
      return allTools.filter((t) =>
        ['profile_dataset', 'scan_feature_leakage', 'run_drift_tests'].includes(t.name)
      );
    }

    return allTools;
  }
}
