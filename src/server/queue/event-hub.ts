import { EventEmitter } from 'node:events';
import type { StreamEvent } from './types.ts';
import type { InvestigationEventMessage } from '../orchestrator/investigator.ts';

export class InvestigationEventHub {
  private readonly eventEmitter = new EventEmitter();
  private readonly history = new Map<string, StreamEvent[]>();
  private readonly sequenceCounters = new Map<string, number>();
  private readonly MAX_BUFFER_PER_INVESTIGATION = 2000;

  constructor() {
    this.eventEmitter.setMaxListeners(100);
  }

  /**
   * Publishes an investigation telemetry event, assigning a monotonically increasing eventId.
   */
  publish(investigationId: string, payload: InvestigationEventMessage): StreamEvent {
    const nextSeq = (this.sequenceCounters.get(investigationId) ?? 0) + 1;
    this.sequenceCounters.set(investigationId, nextSeq);

    const streamEvent: StreamEvent = {
      eventId: nextSeq,
      investigationId,
      timestamp: new Date().toISOString(),
      payload,
    };

    let events = this.history.get(investigationId);
    if (!events) {
      events = [];
      this.history.set(investigationId, events);
    }
    events.push(streamEvent);
    if (events.length > this.MAX_BUFFER_PER_INVESTIGATION) {
      events.shift();
    }

    this.eventEmitter.emit(`event:${investigationId}`, streamEvent);
    return streamEvent;
  }

  /**
   * Retrieves past event history for an investigation, optionally starting after lastEventId.
   */
  getHistory(investigationId: string, sinceEventId: number = 0): StreamEvent[] {
    const events = this.history.get(investigationId) ?? [];
    if (sinceEventId <= 0) {
      return [...events];
    }
    return events.filter((e) => e.eventId > sinceEventId);
  }

  /**
   * Checks whether the investigation has reached a terminal state (completed, stopped, or fatal error).
   */
  isTerminal(investigationId: string): boolean {
    const events = this.history.get(investigationId) ?? [];
    if (events.length === 0) return false;
    const lastEvent = events[events.length - 1];
    return (
      lastEvent.payload.type === 'completed' ||
      lastEvent.payload.type === 'stopped' ||
      (lastEvent.payload.type === 'error' && lastEvent.payload.fatal)
    );
  }

  /**
   * Subscribes to investigation events with automatic replay of events missed since lastEventId.
   * Returns an unsubscribe cleanup function.
   */
  subscribe(
    investigationId: string,
    listener: (event: StreamEvent) => void,
    lastEventId: number = 0
  ): () => void {
    // 1. Replay missed historical events
    if (lastEventId > 0 || this.history.has(investigationId)) {
      const missed = this.getHistory(investigationId, lastEventId);
      for (const event of missed) {
        listener(event);
      }
    }

    // If investigation already reached terminal state and all historical events were replayed, don't keep listener open
    if (this.isTerminal(investigationId)) {
      return () => {};
    }

    // 2. Subscribe to new live events
    const eventKey = `event:${investigationId}`;
    const handler = (event: StreamEvent) => {
      // Prevent duplicate playback of events that were already in the catchup replay
      if (event.eventId > lastEventId) {
        listener(event);
      }
    };

    this.eventEmitter.on(eventKey, handler);

    return () => {
      this.eventEmitter.off(eventKey, handler);
    };
  }

  clear(investigationId: string): void {
    this.history.delete(investigationId);
    this.sequenceCounters.delete(investigationId);
    this.eventEmitter.removeAllListeners(`event:${investigationId}`);
  }

  resetForTesting(): void {
    this.history.clear();
    this.sequenceCounters.clear();
    this.eventEmitter.removeAllListeners();
  }
}

// Global singleton event hub
let globalEventHub: InvestigationEventHub | null = null;

export function getEventHub(): InvestigationEventHub {
  if (!globalEventHub) {
    globalEventHub = new InvestigationEventHub();
  }
  return globalEventHub;
}

export function setEventHubForTest(hub: InvestigationEventHub | null): void {
  globalEventHub = hub;
}
