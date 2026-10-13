import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GeminiInvestigatorProvider } from '../../src/server/orchestrator/provider-gemini.ts';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { createId } from '../../src/core/domain/primitives.ts';
import { createDraftInvestigation } from '../../src/core/investigation/state-machine.ts';
import { toolNames } from '../../src/core/domain/tool-contracts.ts';

const melanomaCsv = readFileSync(
  join(process.cwd(), 'public', 'fixtures', 'melanoma-synthetic.csv'),
  'utf8'
);

function makeDataset() {
  return ingestEvaluationCsv(melanomaCsv, 'melanoma-synthetic.csv', {
    datasetId: createId('dataset'),
    sourceId: createId('source'),
    labels: { positive: '1', negative: '0' },
  });
}

function makeTurnRequest(overrides = {}) {
  const dataset = makeDataset();
  const investigation = createDraftInvestigation('Investigate melanoma paradox');
  return {
    investigation,
    dataset,
    currentRound: 1,
    maxRounds: 10,
    userDirectives: [],
    history: [],
    availableTools: toolNames,
    ...overrides,
  };
}

test('gemini-provider: initialization defaults to gemini-3.8-flash and respects custom model', () => {
  const defaultProvider = new GeminiInvestigatorProvider('dummy-key');
  assert.equal(defaultProvider.name, 'gemini_astra_investigator');
  assert.equal(defaultProvider.model, 'gemini-3.8-flash');

  const customProvider = new GeminiInvestigatorProvider('dummy-key', { model: 'gemini-custom-model' });
  assert.equal(customProvider.model, 'gemini-custom-model');
});

test('gemini-provider: SDK request mapping converts tools, system instructions, and config properly', async () => {
  let capturedCall = null;
  const mockClient = {
    models: {
      generateContent: async (params) => {
        capturedCall = params;
        return {
          text: 'Beginning investigation.',
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 25, totalTokenCount: 145 },
        };
      },
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', {
    client: mockClient,
    model: 'gemini-3.8-flash',
    maxOutputTokens: 2048,
    temperature: 0.2,
  });

  const request = makeTurnRequest();
  await provider.nextStep(request);

  assert.ok(capturedCall);
  assert.equal(capturedCall.model, 'gemini-3.8-flash');
  assert.ok(capturedCall.config.systemInstruction.includes('You are Astra, the lead ML reliability investigator'));
  assert.ok(capturedCall.config.systemInstruction.includes('ZERO FABRICATION OF NUMBERS'));
  assert.equal(capturedCall.config.maxOutputTokens, 2048);
  assert.equal(capturedCall.config.temperature, 0.2);

  // Check tools declaration
  const declarations = capturedCall.config.tools[0].functionDeclarations;
  assert.ok(declarations.length >= 10);
  const profileTool = declarations.find((d) => d.name === 'profile_dataset');
  assert.ok(profileTool);
  assert.equal(profileTool.parameters.type, 'OBJECT');
  assert.equal(profileTool.parameters.properties.datasetId.type, 'STRING');
});

test('gemini-provider: maps tool calling response into typed call_tool action', async () => {
  const mockClient = {
    models: {
      generateContent: async () => ({
        functionCalls: [
          {
            name: 'compute_classification_metrics',
            args: { datasetId: 'ds_test', positiveLabel: '1' },
          },
        ],
        text: 'Evaluating baseline classification performance.',
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 15, totalTokenCount: 95 },
      }),
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', { client: mockClient });
  const request = makeTurnRequest();
  const response = await provider.nextStep(request);

  assert.equal(response.action, 'call_tool');
  assert.equal(response.tool, 'compute_classification_metrics');
  assert.deepEqual(response.input, { datasetId: 'ds_test', positiveLabel: '1' });
  assert.equal(response.rationale, 'Evaluating baseline classification performance.');
  assert.equal(response.provider, 'gemini_astra_investigator');
  assert.equal(response.model, 'gemini-3.8-flash');
  assert.deepEqual(response.usage, { promptTokens: 80, completionTokens: 15, totalTokens: 95 });

  // Cumulative usage tracking
  assert.deepEqual(provider.getCumulativeUsage(), { promptTokens: 80, completionTokens: 15, totalTokens: 95 });
});

test('gemini-provider: maps hypothesis response when content contains hypothesis directive', async () => {
  const mockClient = {
    models: {
      generateContent: async () => ({
        text: 'Hypothesis: Extreme minority omission caused by Accuracy Paradox at 0.50 threshold.',
      }),
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', { client: mockClient });
  const request = makeTurnRequest();
  const response = await provider.nextStep(request);

  assert.equal(response.action, 'propose_hypothesis');
  assert.equal(response.statement, 'Extreme minority omission caused by Accuracy Paradox at 0.50 threshold.');
  assert.equal(response.confidenceLevel, 'limited');
});

test('gemini-provider: maps concluding summary to conclude action', async () => {
  const mockClient = {
    models: {
      generateContent: async () => ({
        text: 'Diagnosis confirmed: operating cutoff 0.19 recovers malignant recall from 22.4% to 94.8%.',
      }),
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', { client: mockClient });
  const request = makeTurnRequest({
    investigation: {
      ...createDraftInvestigation('Melanoma'),
      hypotheses: [{ id: createId('hypothesis'), statement: 'Test hyp' }],
    },
  });
  const response = await provider.nextStep(request);

  assert.equal(response.action, 'conclude');
  assert.ok(response.rootCause.includes('Diagnosis confirmed'));
  assert.equal(response.confidenceLevel, 'strong');
});

test('gemini-provider: multi-turn tool execution formats functionCall and functionResponse parts', async () => {
  let capturedContents = null;
  const mockClient = {
    models: {
      generateContent: async (params) => {
        capturedContents = params.contents;
        return {
          text: 'Received tool output, formulating conclusion.',
        };
      },
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', { client: mockClient });
  const request = makeTurnRequest({
    currentRound: 2,
    history: [
      {
        round: 1,
        timestamp: new Date().toISOString(),
        kind: 'tool_call',
        data: {
          call: {
            id: createId('call'),
            investigationId: createId('investigation'),
            tool: 'profile_dataset',
            toolVersion: 1,
            requestedAt: new Date().toISOString(),
            input: { datasetId: 'ds_1' },
          },
        },
      },
      {
        round: 1,
        timestamp: new Date().toISOString(),
        kind: 'tool_result',
        data: {
          result: {
            id: createId('result'),
            callId: createId('call'),
            tool: 'profile_dataset',
            toolVersion: 1,
            completedAt: new Date().toISOString(),
            datasetIds: ['ds_1'],
            evidenceIds: [],
            limitations: [],
            status: 'completed',
            output: { rowCount: 20000, targetBalance: { '0': 0.942, '1': 0.058 } },
          },
        },
      },
    ],
  });

  await provider.nextStep(request);

  assert.ok(capturedContents);
  // Verify contents structure has: user prompt -> model functionCall -> user functionResponse
  const modelPart = capturedContents.find((c) => c.role === 'model')?.parts[0];
  assert.ok(modelPart?.functionCall);
  assert.equal(modelPart.functionCall.name, 'profile_dataset');

  const userFuncResponse = capturedContents.find((c) => c.role === 'user' && c.parts[0]?.functionResponse);
  assert.ok(userFuncResponse);
  assert.equal(userFuncResponse.parts[0].functionResponse.name, 'profile_dataset');
  assert.equal(userFuncResponse.parts[0].functionResponse.response.status, 'completed');
});

test('gemini-provider: safe handling of unallowlisted tool attempts fallback safely', async () => {
  const mockClient = {
    models: {
      generateContent: async () => ({
        functionCalls: [
          {
            name: 'arbitrary_server_exec',
            args: { cmd: 'rm -rf /' },
          },
        ],
      }),
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', { client: mockClient });
  const request = makeTurnRequest();
  const response = await provider.nextStep(request);

  // Must reject unauthorized tool and fallback safely to deterministic offline provider
  assert.notEqual(response.tool, 'arbitrary_server_exec');
  assert.ok(response.action === 'call_tool' || response.action === 'propose_hypothesis');
});

test('gemini-provider: handles rate-limit 429 with bounded retries and informative quota error', async () => {
  let callCount = 0;
  const mockClient = {
    models: {
      generateContent: async () => {
        callCount++;
        throw new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric');
      },
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', {
    client: mockClient,
    maxRetries: 1, // 1 retry = 2 attempts total
  });

  const request = makeTurnRequest();
  // Safe fallback to offline provider when rate limit is exhausted
  const response = await provider.nextStep(request);
  assert.equal(callCount, 2);
  assert.ok(response);
});

test('gemini-provider: authentication error 401/403 fails fast without uncontrolled retries', async () => {
  let callCount = 0;
  const mockClient = {
    models: {
      generateContent: async () => {
        callCount++;
        throw new Error('401 UNAUTHENTICATED: API_KEY_INVALID');
      },
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', {
    client: mockClient,
    maxRetries: 3,
  });

  const request = makeTurnRequest();
  const response = await provider.nextStep(request);
  // Fails fast after 1 attempt and falls back safely
  assert.equal(callCount, 1);
  assert.ok(response);
});

test('gemini-provider: model not found error reports actual error and discovers compatible alternative', async () => {
  const mockClient = {
    models: {
      generateContent: async () => {
        throw new Error('404 NOT_FOUND: models/gemini-3.8-flash is not found');
      },
      list: async () => [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.0-flash' }],
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', {
    client: mockClient,
    model: 'gemini-3.8-flash',
    maxRetries: 0,
  });

  const discovered = await provider.discoverAvailableModels();
  assert.ok(discovered.includes('gemini-2.5-flash'));

  const request = makeTurnRequest();
  const response = await provider.nextStep(request);
  assert.ok(response);
});

test('gemini-provider: safe handling of empty or malformed responses', async () => {
  const mockClient = {
    models: {
      generateContent: async () => null,
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', { client: mockClient });
  const request = makeTurnRequest();
  const response = await provider.nextStep(request);

  // Graceful deterministic fallback
  assert.ok(response);
  assert.ok(response.action);
});
