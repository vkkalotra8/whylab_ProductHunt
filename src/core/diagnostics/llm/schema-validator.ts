/**
 * Zero-dependency pure TypeScript JSON parser and schema compliance validator.
 * Validates LLM responses for structural conformity, syntax errors, and schema constraints.
 */

export interface SimpleJsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  required?: string[];
  properties?: Record<string, SimpleJsonSchema>;
  items?: SimpleJsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
}

export interface JsonSchemaViolation {
  path: string;
  rule: 'type' | 'required' | 'enum' | 'minimum' | 'maximum' | 'minLength' | 'maxLength' | 'pattern';
  expected: string;
  actual: string;
  message: string;
}

export interface JsonRecordValidationResult {
  caseId: string;
  isJsonParseValid: boolean;
  parseError?: string;
  parsedObject?: unknown;
  wasMarkdownWrapped: boolean;
  extractedFromMarkdown: boolean;

  // Schema compliance (optional if schema provided)
  schemaEvaluated: boolean;
  isSchemaCompliant?: boolean;
  violations?: JsonSchemaViolation[];
}

export interface JsonMetricsSummary {
  evaluatedRecordCount: number;

  // JSON Parse Validity
  validParseCount: number;
  jsonParseValidityRate: number; // 0.0 - 1.0
  markdownFencedCount: number;

  // JSON Schema Compliance
  hasSchemaConfigured: boolean;
  compliantCount?: number;
  jsonSchemaComplianceRate?: number; // 0.0 - 1.0 (when schema provided)
  commonViolations: Array<{ message: string; count: number }>;

  perRecordResults: JsonRecordValidationResult[];
}

/**
 * Extracts JSON from potential markdown fences (```json ... ```)
 */
export function extractJsonFromMarkdown(text: string): { extracted: string; wasFenced: boolean } {
  const trimmed = text.trim();
  const fenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = trimmed.match(fenceRegex);
  if (match && match[1]) {
    return { extracted: match[1].trim(), wasFenced: true };
  }
  return { extracted: trimmed, wasFenced: false };
}

/**
 * Tests if response string parses as valid JSON
 */
export function checkJsonParseValidity(response: string): {
  isValid: boolean;
  parsed?: unknown;
  error?: string;
  wasMarkdownWrapped: boolean;
  extractedFromMarkdown: boolean;
} {
  const trimmed = response.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Response is empty string',
      wasMarkdownWrapped: false,
      extractedFromMarkdown: false,
    };
  }

  // 1. Try parsing directly
  try {
    const directParsed = JSON.parse(trimmed);
    return {
      isValid: true,
      parsed: directParsed,
      wasMarkdownWrapped: false,
      extractedFromMarkdown: false,
    };
  } catch (directErr) {
    // 2. Check if wrapped in markdown code fence
    const { extracted, wasFenced } = extractJsonFromMarkdown(trimmed);
    if (wasFenced) {
      try {
        const fencedParsed = JSON.parse(extracted);
        return {
          isValid: true,
          parsed: fencedParsed,
          wasMarkdownWrapped: true,
          extractedFromMarkdown: true,
        };
      } catch (fencedErr) {
        return {
          isValid: false,
          error: `Markdown fenced JSON syntax error: ${(fencedErr as Error).message}`,
          wasMarkdownWrapped: true,
          extractedFromMarkdown: false,
        };
      }
    }

    return {
      isValid: false,
      error: (directErr as Error).message,
      wasMarkdownWrapped: false,
      extractedFromMarkdown: false,
    };
  }
}

/**
 * Pure TypeScript recursive JSON schema validator
 */
export function validateAgainstSchema(
  data: unknown,
  schema: SimpleJsonSchema,
  currentPath = '$'
): JsonSchemaViolation[] {
  const violations: JsonSchemaViolation[] = [];

  // 1. Type validation
  if (schema.type) {
    const actualType = getJsonType(data);
    let typeMatches = actualType === schema.type;
    if (schema.type === 'number' && actualType === 'integer') {
      typeMatches = true;
    }
    if (!typeMatches) {
      violations.push({
        path: currentPath,
        rule: 'type',
        expected: schema.type,
        actual: actualType ?? 'unknown',
        message: `Expected type "${schema.type}" at ${currentPath}, but received "${actualType}"`,
      });
      return violations; // Stop further child checks on type mismatch
    }
  }

  // 2. Enum check
  if (schema.enum && Array.isArray(schema.enum)) {
    const matched = schema.enum.some((val) => JSON.stringify(val) === JSON.stringify(data));
    if (!matched) {
      violations.push({
        path: currentPath,
        rule: 'enum',
        expected: JSON.stringify(schema.enum),
        actual: JSON.stringify(data),
        message: `Value at ${currentPath} must be one of: ${JSON.stringify(schema.enum)}`,
      });
    }
  }

  // 3. String constraints
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      violations.push({
        path: currentPath,
        rule: 'minLength',
        expected: `>= ${schema.minLength} chars`,
        actual: `${data.length} chars`,
        message: `String at ${currentPath} is too short (length ${data.length} < ${schema.minLength})`,
      });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      violations.push({
        path: currentPath,
        rule: 'maxLength',
        expected: `<= ${schema.maxLength} chars`,
        actual: `${data.length} chars`,
        message: `String at ${currentPath} is too long (length ${data.length} > ${schema.maxLength})`,
      });
    }
    if (schema.pattern) {
      try {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          violations.push({
            path: currentPath,
            rule: 'pattern',
            expected: `matches /${schema.pattern}/`,
            actual: data,
            message: `String at ${currentPath} does not match pattern /${schema.pattern}/`,
          });
        }
      } catch {
        // Invalid regex pattern in schema definition
      }
    }
  }

  // 4. Number constraints
  if (typeof data === 'number' && Number.isFinite(data)) {
    if (schema.minimum !== undefined && data < schema.minimum) {
      violations.push({
        path: currentPath,
        rule: 'minimum',
        expected: `>= ${schema.minimum}`,
        actual: String(data),
        message: `Number at ${currentPath} is below minimum (${data} < ${schema.minimum})`,
      });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      violations.push({
        path: currentPath,
        rule: 'maximum',
        expected: `<= ${schema.maximum}`,
        actual: String(data),
        message: `Number at ${currentPath} is above maximum (${data} > ${schema.maximum})`,
      });
    }
  }

  // 5. Object constraints (required & properties)
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if (schema.required && Array.isArray(schema.required)) {
      for (const requiredKey of schema.required) {
        if (!(requiredKey in obj) || obj[requiredKey] === undefined) {
          violations.push({
            path: `${currentPath}.${requiredKey}`,
            rule: 'required',
            expected: `key "${requiredKey}" to be present`,
            actual: 'missing',
            message: `Missing required property "${requiredKey}" at ${currentPath}`,
          });
        }
      }
    }

    if (schema.properties) {
      for (const [propKey, propSchema] of Object.entries(schema.properties)) {
        if (propKey in obj && obj[propKey] !== undefined) {
          const childViolations = validateAgainstSchema(
            obj[propKey],
            propSchema,
            `${currentPath}.${propKey}`
          );
          violations.push(...childViolations);
        }
      }
    }
  }

  // 6. Array constraints (items)
  if (Array.isArray(data) && schema.items) {
    for (let i = 0; i < data.length; i++) {
      const itemViolations = validateAgainstSchema(data[i], schema.items, `${currentPath}[${i}]`);
      violations.push(...itemViolations);
    }
  }

  return violations;
}

function getJsonType(val: unknown): SimpleJsonSchema['type'] {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? 'integer' : 'number';
  }
  if (typeof val === 'string') return 'string';
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'object') return 'object';
  return 'null';
}

/**
 * Evaluates JSON validity and schema compliance for a collection of LLM responses
 */
export function evaluateJsonMetrics(
  records: Array<{ caseId: string; response: string }>,
  schema?: SimpleJsonSchema
): JsonMetricsSummary {
  const perRecordResults: JsonRecordValidationResult[] = [];
  const violationCounts = new Map<string, number>();
  let validCount = 0;
  let markdownFencedCount = 0;
  let compliantCount = 0;

  for (const rec of records) {
    const parseResult = checkJsonParseValidity(rec.response);

    if (parseResult.wasMarkdownWrapped) {
      markdownFencedCount++;
    }

    if (!parseResult.isValid) {
      perRecordResults.push({
        caseId: rec.caseId,
        isJsonParseValid: false,
        parseError: parseResult.error,
        wasMarkdownWrapped: parseResult.wasMarkdownWrapped,
        extractedFromMarkdown: false,
        schemaEvaluated: false,
        isSchemaCompliant: false,
      });
      continue;
    }

    validCount++;

    let isCompliant = true;
    let recordViolations: JsonSchemaViolation[] | undefined;

    if (schema) {
      recordViolations = validateAgainstSchema(parseResult.parsed, schema);
      isCompliant = recordViolations.length === 0;
      if (isCompliant) {
        compliantCount++;
      } else {
        for (const v of recordViolations) {
          violationCounts.set(v.message, (violationCounts.get(v.message) ?? 0) + 1);
        }
      }
    }

    perRecordResults.push({
      caseId: rec.caseId,
      isJsonParseValid: true,
      parsedObject: parseResult.parsed,
      wasMarkdownWrapped: parseResult.wasMarkdownWrapped,
      extractedFromMarkdown: parseResult.extractedFromMarkdown,
      schemaEvaluated: !!schema,
      isSchemaCompliant: schema ? isCompliant : undefined,
      violations: recordViolations,
    });
  }

  const commonViolations = Array.from(violationCounts.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const total = records.length;

  return {
    evaluatedRecordCount: total,
    validParseCount: validCount,
    jsonParseValidityRate: total > 0 ? Number((validCount / total).toFixed(4)) : 0,
    markdownFencedCount,
    hasSchemaConfigured: !!schema,
    compliantCount: schema ? compliantCount : undefined,
    jsonSchemaComplianceRate: schema && total > 0 ? Number((compliantCount / total).toFixed(4)) : undefined,
    commonViolations,
    perRecordResults,
  };
}
