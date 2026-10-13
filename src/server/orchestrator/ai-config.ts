/**
 * AI Provider Configuration & Factory
 * Manages provider selection (gemini, openai, offline), validation,
 * and security invariants (zero secret leakage).
 */

export type AIProviderType = 'gemini' | 'openai' | 'offline';

export interface AIProviderConfig {
  enabled: boolean;
  provider: AIProviderType;
  gemini: {
    apiKeyConfigured: boolean;
    model: string;
  };
  openai: {
    apiKeyConfigured: boolean;
    model: string;
  };
}

export class ProviderConfigurationError extends Error {
  readonly code = 'PROVIDER_CONFIGURATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}

/**
 * Sanitizes any string to ensure secrets like API keys are never exposed in logs or errors.
 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    // Redact Google API keys (AIzaSy...)
    .replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_GEMINI_KEY]')
    // Redact OpenAI API keys (sk-...)
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_OPENAI_KEY]')
    // Redact generic long bearer/api tokens
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/((?:key|token|secret|password)=)[A-Za-z0-9._-]{16,}/gi, '$1[REDACTED]');
}

/**
 * Resolves current AI configuration from server environment variables.
 * Never returns raw API keys.
 */
export function getAIProviderConfig(): AIProviderConfig {
  const enabled = process.env.WHYLAB_AI_ENABLED === 'true';
  const rawProvider = (process.env.WHYLAB_AI_PROVIDER ?? '').toLowerCase().trim();

  let provider: AIProviderType = 'offline';
  if (rawProvider === 'gemini') {
    provider = 'gemini';
  } else if (rawProvider === 'openai') {
    provider = 'openai';
  } else if (rawProvider === 'offline') {
    provider = 'offline';
  } else if (process.env.GEMINI_API_KEY) {
    provider = 'gemini';
  } else if (process.env.OPENAI_API_KEY) {
    provider = 'openai';
  }

  return {
    enabled,
    provider,
    gemini: {
      apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
      model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    },
    openai: {
      apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0),
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o',
    },
  };
}

/**
 * Checks provider readiness and returns human-readable status and actionable message.
 */
export function getAIProviderReadiness(): {
  status: 'ready' | 'missing_api_key' | 'disabled' | 'offline';
  activeProvider: AIProviderType;
  activeModel: string;
  actionableError?: string;
} {
  const config = getAIProviderConfig();

  if (config.provider === 'offline') {
    return {
      status: 'offline',
      activeProvider: 'offline',
      activeModel: 'deterministic-flagship',
    };
  }

  if (config.provider === 'gemini') {
    if (!config.gemini.apiKeyConfigured) {
      return {
        status: 'missing_api_key',
        activeProvider: 'gemini',
        activeModel: config.gemini.model,
        actionableError:
          'Google Gemini provider is selected (WHYLAB_AI_PROVIDER=gemini) but GEMINI_API_KEY is missing in .env.local. Add GEMINI_API_KEY=<your-key> or set WHYLAB_AI_PROVIDER=offline.',
      };
    }
    return {
      status: config.enabled ? 'ready' : 'disabled',
      activeProvider: 'gemini',
      activeModel: config.gemini.model,
      actionableError: config.enabled
        ? undefined
        : 'Google Gemini credentials present, but WHYLAB_AI_ENABLED is not set to true. Set WHYLAB_AI_ENABLED=true in .env.local to activate.',
    };
  }

  if (config.provider === 'openai') {
    if (!config.openai.apiKeyConfigured) {
      return {
        status: 'missing_api_key',
        activeProvider: 'openai',
        activeModel: config.openai.model,
        actionableError:
          'OpenAI provider is selected (WHYLAB_AI_PROVIDER=openai) but OPENAI_API_KEY is missing. Add OPENAI_API_KEY or set WHYLAB_AI_PROVIDER=offline.',
      };
    }
    return {
      status: config.enabled ? 'ready' : 'disabled',
      activeProvider: 'openai',
      activeModel: config.openai.model,
      actionableError: config.enabled
        ? undefined
        : 'OpenAI credentials present, but WHYLAB_AI_ENABLED is not set to true. Set WHYLAB_AI_ENABLED=true to activate.',
    };
  }

  return {
    status: 'offline',
    activeProvider: 'offline',
    activeModel: 'deterministic-flagship',
  };
}

