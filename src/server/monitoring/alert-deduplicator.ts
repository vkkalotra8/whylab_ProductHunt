export class AlertDeduplicator {
  // Key format: `${organizationId}:${ruleId}:${metric}:${column ?? 'all'}` -> lastAlertTimestamp (ms)
  private readonly cooldowns = new Map<string, number>();

  private buildKey(organizationId: string, ruleId: string, metric: string, column?: string): string {
    return `${organizationId}:${ruleId}:${metric}:${column ?? 'all'}`;
  }

  /**
   * Checks whether an alert for this rule condition should be suppressed due to active cooldown window.
   */
  shouldSuppress(
    organizationId: string,
    ruleId: string,
    metric: string,
    column: string | undefined,
    cooldownMinutes: number
  ): boolean {
    if (cooldownMinutes <= 0) return false;
    const key = this.buildKey(organizationId, ruleId, metric, column);
    const lastAlert = this.cooldowns.get(key);
    if (!lastAlert) return false;

    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = Date.now();
    return now - lastAlert < cooldownMs;
  }

  /**
   * Records that an alert was triggered, resetting the cooldown clock.
   */
  recordAlert(organizationId: string, ruleId: string, metric: string, column?: string): void {
    const key = this.buildKey(organizationId, ruleId, metric, column);
    this.cooldowns.set(key, Date.now());
  }

  /**
   * Clears the cooldown for a specific condition.
   */
  clearCooldown(organizationId: string, ruleId: string, metric: string, column?: string): void {
    const key = this.buildKey(organizationId, ruleId, metric, column);
    this.cooldowns.delete(key);
  }

  resetForTesting(): void {
    this.cooldowns.clear();
  }
}

// Global Singleton
let globalDeduplicator: AlertDeduplicator | null = null;

export function getAlertDeduplicator(): AlertDeduplicator {
  if (!globalDeduplicator) {
    globalDeduplicator = new AlertDeduplicator();
  }
  return globalDeduplicator;
}

export function setAlertDeduplicatorForTest(deduplicator: AlertDeduplicator | null): void {
  globalDeduplicator = deduplicator;
}
