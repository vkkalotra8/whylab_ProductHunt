import type { InvestigatorProvider } from './provider.ts';
import { OfflineInvestigatorProvider } from './provider-offline.ts';
import { OpenAIInvestigatorProvider } from './provider-openai.ts';
import { GeminiInvestigatorProvider } from './provider-gemini.ts';
import { getAIProviderConfig, ProviderConfigurationError } from './ai-config.ts';

export interface ResolveProviderOptions {
  provider?: InvestigatorProvider;
  offlineOnly?: boolean;
}

/**
 * Resolves the appropriate Astra investigator provider based on configuration.
 * Adheres strictly to provider contracts, actionable errors on missing credentials,
 * and deterministic fallback.
 */
export function resolveInvestigatorProvider(
  options: ResolveProviderOptions = {}
): InvestigatorProvider {
  if (options.provider) {
    return options.provider;
  }

  if (options.offlineOnly) {
    return new OfflineInvestigatorProvider();
  }

  const config = getAIProviderConfig();
  const rawProvider = (process.env.WHYLAB_AI_PROVIDER ?? '').toLowerCase().trim();

  // 1. Explicit provider selection
  if (rawProvider === 'gemini') {
    if (!config.gemini.apiKeyConfigured) {
      throw new ProviderConfigurationError(
        'Gemini provider is selected (WHYLAB_AI_PROVIDER=gemini) but GEMINI_API_KEY is not configured in .env.local. Please set GEMINI_API_KEY=<your-key> to activate Google Gemini, or set WHYLAB_AI_PROVIDER=offline.'
      );
    }
    return new GeminiInvestigatorProvider(process.env.GEMINI_API_KEY, {
      model: config.gemini.model,
    });
  }

  if (rawProvider === 'openai') {
    if (!config.openai.apiKeyConfigured) {
      throw new ProviderConfigurationError(
        'OpenAI provider is selected (WHYLAB_AI_PROVIDER=openai) but OPENAI_API_KEY is not configured in environment. Please set OPENAI_API_KEY or set WHYLAB_AI_PROVIDER=offline.'
      );
    }
    return new OpenAIInvestigatorProvider(process.env.OPENAI_API_KEY, config.openai.model);
  }

  if (rawProvider === 'offline') {
    return new OfflineInvestigatorProvider();
  }

  // 2. Default resolution based on presence of API keys
  if (process.env.GEMINI_API_KEY) {
    return new GeminiInvestigatorProvider(process.env.GEMINI_API_KEY, {
      model: config.gemini.model,
    });
  }

  if (process.env.OPENAI_API_KEY) {
    return new OpenAIInvestigatorProvider(process.env.OPENAI_API_KEY, config.openai.model);
  }

  // 3. Fallback to deterministic offline investigator
  return new OfflineInvestigatorProvider();
}

