import test from 'node:test';
import assert from 'node:assert/strict';
import { InvestigationEventHub } from '../../src/server/queue/event-hub.ts';

test('InvestigationEventHub: assigns monotonic event IDs and buffers telemetry history', () => {
  const hub = new InvestigationEventHub();
  const invId = 'inv_test_123';

  const e1 = hub.publish(invId, {
    type: 'started',
    investigationId: invId,
    objective: 'Test Objective',
  });
  const e2 = hub.publish(invId, {
    type: 'progress',
    round: 1,
    maxRounds: 5,
    stage: 'profile',
    message: 'Profiling dataset',
  });
  const e3 = hub.publish(invId, {
    type: 'progress',
    round: 2,
    maxRounds: 5,
    stage: 'classification',
    message: 'Computing metrics',
  });

  assert.equal(e1.eventId, 1);
  assert.equal(e2.eventId, 2);
  assert.equal(e3.eventId, 3);

  // Retrieve full history
  const allEvents = hub.getHistory(invId);
  assert.equal(allEvents.length, 3);
  assert.equal(allEvents[0].eventId, 1);
  assert.equal(allEvents[2].eventId, 3);

  // Retrieve partial history since event 1
  const afterOne = hub.getHistory(invId, 1);
  assert.equal(afterOne.length, 2);
  assert.equal(afterOne[0].eventId, 2);
  assert.equal(afterOne[1].eventId, 3);

  assert.equal(hub.isTerminal(invId), false);

  // Publish completed
  hub.publish(invId, {
    type: 'completed',
    investigation: { id: invId },
  });
  assert.equal(hub.isTerminal(invId), true);
});

test('InvestigationEventHub: reconnectable subscription replays missed events seamlessly', async () => {
  const hub = new InvestigationEventHub();
  const invId = 'inv_stream_456';

  // Pre-seed 3 events while client is offline / before reconnection
  hub.publish(invId, { type: 'started', investigationId: invId, objective: 'Init' });
  hub.publish(invId, { type: 'progress', round: 1, maxRounds: 4, stage: '1', message: 'Step 1' });
  hub.publish(invId, { type: 'progress', round: 2, maxRounds: 4, stage: '2', message: 'Step 2' });

  // Client reconnects with Last-Event-ID = 1 (missed events 2 and 3)
  const received = [];
  const unsubscribe = hub.subscribe(
    invId,
    (event) => {
      received.push(event.eventId);
    },
    1 // lastEventId
  );

  // Should have immediately replayed events 2 and 3
  assert.deepEqual(received, [2, 3]);

  // Now publish a new live event 4
  hub.publish(invId, { type: 'progress', round: 3, maxRounds: 4, stage: '3', message: 'Step 3' });
  assert.deepEqual(received, [2, 3, 4]);

  unsubscribe();
});
