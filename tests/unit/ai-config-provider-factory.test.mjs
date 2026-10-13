import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAIProviderConfig,
  getAIProviderReadiness,
  redactSecrets,
  ProviderConfigurationError,
} from '../../src/server/orchestrator/ai-config.ts';
import { resolveInvestigatorProvider } from '../../src/server/orchestrator/provider-factory.ts';
import { GeminiInvestigatorProvider } from '../../src/server/orchestrator/provider-gemini.ts';
import { OpenAIInvestigatorProvider } from '../../src/server/orchestrator/provider-openai.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';

test('ai-config: redacts secrets from error messages and logs', () => {
  const geminiSample = 'Error with key AIzaSyABC1234567890123456789012345678901 failed to connect';
  const openaiSample = 'Error with key sk-abcdef1234567890abcdef1234567890 failed';
  const bearerSample = 'Authorization: Bearer my-secret-jwt-token-1234567890';

  assert.ok(!redactSecrets(geminiSample).includes('AIzaSy'));
  assert.ok(redactSecrets(geminiSample).includes('[REDACTED_GEMINI_KEY]'));

  assert.ok(!redactSecrets(openaiSample).includes('sk-abcdef'));
  assert.ok(redactSecrets(openaiSample).includes('[REDACTED_OPENAI_KEY]'));

  assert.ok(!redactSecrets(bearerSample).includes('my-secret-jwt'));
  assert.ok(redactSecrets(bearerSample).includes('[REDACTED_TOKEN]'));
});

test('provider-factory: provider selection and missing API key handling', () => {
  const origEnv = { ...process.env };

  try {
    // 1. Explicit Gemini with missing API key throws actionable ProviderConfigurationError
    process.env.WHYLAB_AI_ENABLED = 'true';
    process.env.WHYLAB_AI_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;

    assert.throws(
      () => resolveInvestigatorProvider(),
      (err) => {
        assert.ok(err instanceof ProviderConfigurationError);
        assert.ok(err.message.includes('GEMINI_API_KEY is not configured'));
        assert.ok(err.message.includes('.env.local'));
        return true;
      }
    );

    // 2. Explicit Gemini with API key returns GeminiInvestigatorProvider
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    const geminiProv = resolveInvestigatorProvider();
    assert.ok(geminiProv instanceof GeminiInvestigatorProvider);
    assert.equal(geminiProv.name, 'gemini_astra_investigator');
    assert.equal(geminiProv.model, 'gemini-3.8-flash');

    // 3. Explicit OpenAI with missing key throws actionable ProviderConfigurationError
    process.env.WHYLAB_AI_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    assert.throws(
      () => resolveInvestigatorProvider(),
      (err) => {
        assert.ok(err instanceof ProviderConfigurationError);
        assert.ok(err.message.includes('OPENAI_API_KEY is not configured'));
        return true;
      }
    );

    // 4. Explicit OpenAI with key returns OpenAIInvestigatorProvider
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const openaiProv = resolveInvestigatorProvider();
    assert.ok(openaiProv instanceof OpenAIInvestigatorProvider);
    assert.equal(openaiProv.name, 'openai_astra_investigator');

    // 5. Explicit offline returns OfflineInvestigatorProvider
    process.env.WHYLAB_AI_PROVIDER = 'offline';
    const offlineProv = resolveInvestigatorProvider();
    assert.ok(offlineProv instanceof OfflineInvestigatorProvider);
    assert.equal(offlineProv.name, 'offline_deterministic_investigator');

    // 6. offlineOnly option forces offline even if Gemini key is present
    process.env.WHYLAB_AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const forcedOffline = resolveInvestigatorProvider({ offlineOnly: true });
    assert.ok(forcedOffline instanceof OfflineInvestigatorProvider);

    // 7. Caller-supplied provider is respected directly
    const customProv = new OfflineInvestigatorProvider();
    assert.equal(resolveInvestigatorProvider({ provider: customProv }), customProv);
  } finally {
    process.env = origEnv;
  }
});

test('ai-config: getAIProviderReadiness accurately reports statuses without leaking keys', () => {
  const origEnv = { ...process.env };

  try {
    // Offline
    process.env.WHYLAB_AI_PROVIDER = 'offline';
    const rOffline = getAIProviderReadiness();
    assert.equal(rOffline.status, 'offline');
    assert.equal(rOffline.activeProvider, 'offline');

    // Gemini missing key
    process.env.WHYLAB_AI_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    const rMissing = getAIProviderReadiness();
    assert.equal(rMissing.status, 'missing_api_key');
    assert.equal(rMissing.activeProvider, 'gemini');
    assert.ok(rMissing.actionableError?.includes('GEMINI_API_KEY is missing'));

    // Gemini key present but disabled
    process.env.GEMINI_API_KEY = 'dummy-key';
    process.env.WHYLAB_AI_ENABLED = 'false';
    const rDisabled = getAIProviderReadiness();
    assert.equal(rDisabled.status, 'disabled');
    assert.ok(rDisabled.actionableError?.includes('WHYLAB_AI_ENABLED is not set to true'));

    // Gemini ready
    process.env.WHYLAB_AI_ENABLED = 'true';
    const rReady = getAIProviderReadiness();
    assert.equal(rReady.status, 'ready');
    assert.equal(rReady.activeModel, 'gemini-3.8-flash');
    assert.equal(rReady.actionableError, undefined);
  } finally {
    process.env = origEnv;
  }
});

