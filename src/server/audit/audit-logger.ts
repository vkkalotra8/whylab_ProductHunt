export interface AuditEvent {
  id: string; // `aud_${string}`
  organizationId: string;
  actorId: string;
  action: string;
  objectType: string;
  objectId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// In-memory buffer for local development and test auditing
const inMemoryAuditLogs: AuditEvent[] = [];
const MAX_IN_MEMORY_LOGS = 1000;

/**
 * Records an immutable audit event for security and compliance tracking.
 */
export async function recordAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
  const fullEvent: AuditEvent = {
    ...event,
    id: `aud_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
  };

  inMemoryAuditLogs.unshift(fullEvent);
  if (inMemoryAuditLogs.length > MAX_IN_MEMORY_LOGS) {
    inMemoryAuditLogs.pop();
  }

  return fullEvent;
}

/**
 * Retrieves audit events scoped to a specific organization.
 */
export async function getAuditEvents(
  organizationId: string,
  options: { limit?: number; offset?: number; action?: string } = {}
): Promise<{ events: AuditEvent[]; total: number }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const filtered = inMemoryAuditLogs.filter(
    (e) =>
      e.organizationId === organizationId &&
      (!options.action || e.action === options.action)
  );

  return {
    events: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

/**
 * Clears audit events (used strictly in test fixtures).
 */
export function _resetAuditEventsForTest(): void {
  inMemoryAuditLogs.length = 0;
}
