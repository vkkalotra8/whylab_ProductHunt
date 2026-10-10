/**
 * Security sanitization helpers for CSV processing, user inputs, and formula injection defense.
 */

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Neutralizes CSV/Spreadsheet formula injection (CWE-1236) by prepending a single quote
 * to any cell whose first character is an executable spreadsheet formula trigger (=, +, -, @).
 */
export function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length === 0) return '';

  const firstChar = str.charAt(0);
  if (FORMULA_TRIGGERS.has(firstChar)) {
    // Prepend single quote to neutralize formula execution in spreadsheet software
    return `'${str}`;
  }

  return str;
}

/**
 * Sanitizes general user-supplied text inputs:
 * - Strips dangerous ASCII control characters (NULL, backspace, etc.)
 * - Trims whitespace
 * - Enforces length boundaries to prevent resource exhaustion
 */
export function sanitizeInputText(input: unknown, maxLength = 2000): string {
  if (typeof input !== 'string') return '';

  // Remove NULL and non-printable control characters (except newline \n and tab \t)
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

  if (cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength);
  }

  return cleaned;
}

/**
 * Sanitizes uploaded file names to prevent directory traversal and invalid filesystem characters.
 */
export function sanitizeFileName(name: string): string {
  if (typeof name !== 'string') return 'dataset.csv';

  // Extract base filename without path components
  const baseName = name.replace(/^.*[\\/]/, '');

  // Keep only safe characters: alphanumeric, dots, underscores, dashes
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Enforce reasonable length and prevent empty names
  const trimmed = sanitized.slice(0, 100);
  return trimmed.endsWith('.csv') ? trimmed : `${trimmed}.csv`;
}
