import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateMulticlassVisionMetrics } from '../../src/core/diagnostics/vision/multiclass-metrics.ts';

test('multiclass-metrics: computes exact 3-class precision, recall, f1 and confusion matrix', () => {
  // 12 test samples:
  // cat:  true=cat, pred=cat (3); true=cat, pred=dog (1)  -> support=4, TP=3, FN=1
  // dog:  true=dog, pred=dog (4)                         -> support=4, TP=4, FN=0
  // bird: true=bird, pred=bird (2); true=bird, pred=cat (1); true=bird, pred=dog (1) -> support=4, TP=2, FN=2
  // false positives:
  // cat: pred=cat, true=bird (1) -> FP=1
  // dog: pred=dog, true=cat (1) + true=bird (1) -> FP=2  wait, let's make pred=dog for cat (1), bird (0)
  const records = [
    // Cats (4)
    { imageId: '1', yTrue: 'cat', yPred: 'cat', confidence: 0.9 },
    { imageId: '2', yTrue: 'cat', yPred: 'cat', confidence: 0.8 },
    { imageId: '3', yTrue: 'cat', yPred: 'cat', confidence: 0.85 },
    { imageId: '4', yTrue: 'cat', yPred: 'dog', confidence: 0.75 },

    // Dogs (4)
    { imageId: '5', yTrue: 'dog', yPred: 'dog', confidence: 0.95 },
    { imageId: '6', yTrue: 'dog', yPred: 'dog', confidence: 0.88 },
    { imageId: '7', yTrue: 'dog', yPred: 'dog', confidence: 0.92 },
    { imageId: '8', yTrue: 'dog', yPred: 'dog', confidence: 0.84 },

    // Birds (4)
    { imageId: '9', yTrue: 'bird', yPred: 'bird', confidence: 0.91 },
    { imageId: '10', yTrue: 'bird', yPred: 'bird', confidence: 0.89 },
    { imageId: '11', yTrue: 'bird', yPred: 'cat', confidence: 0.72 },
    { imageId: '12', yTrue: 'bird', yPred: 'cat', confidence: 0.65 },
  ];

  const { metrics, evaluatedRecords } = evaluateMulticlassVisionMetrics(records);

  assert.equal(metrics.totalSamples, 12);
  assert.deepEqual(metrics.classes, ['bird', 'cat', 'dog']);

  // bird: TP=2, FP=0, FN=2, support=4 -> Prec=1.0, Rec=0.5, F1 = 2/3
  const bird = metrics.perClass['bird'];
  assert.equal(bird.truePositives, 2);
  assert.equal(bird.falsePositives, 0);
  assert.equal(bird.falseNegatives, 2);
  assert.equal(bird.precision, 1.0);
  assert.equal(bird.recall, 0.5);
  assert.ok(Math.abs(bird.f1Score - 2 / 3) < 1e-5);

  // cat: TP=3, FP=2 (from birds), FN=1 -> Prec=3/5 = 0.6, Rec=3/4 = 0.75
  const cat = metrics.perClass['cat'];
  assert.equal(cat.truePositives, 3);
  assert.equal(cat.falsePositives, 2);
  assert.equal(cat.falseNegatives, 1);
  assert.equal(cat.precision, 0.6);
  assert.equal(cat.recall, 0.75);

  // dog: TP=4, FP=1 (from cat), FN=0 -> Prec=4/5 = 0.8, Rec=4/4 = 1.0
  const dog = metrics.perClass['dog'];
  assert.equal(dog.truePositives, 4);
  assert.equal(dog.falsePositives, 1);
  assert.equal(dog.falseNegatives, 0);
  assert.equal(dog.precision, 0.8);
  assert.equal(dog.recall, 1.0);

  // Overall accuracy = (2 + 3 + 4) / 12 = 9/12 = 0.75
  assert.equal(metrics.overallAccuracy, 0.75);
  assert.equal(metrics.microF1, 0.75);

  // Check confusion matrix: row=true, col=pred: ['bird', 'cat', 'dog']
  // bird: [2, 2, 0]
  // cat:  [0, 3, 1]
  // dog:  [0, 0, 4]
  assert.deepEqual(metrics.confusionMatrix.matrix, [
    [2, 2, 0],
    [0, 3, 1],
    [0, 0, 4],
  ]);
});

test('multiclass-metrics: null-safe handling of unrepresented classes', () => {
  const records = [
    { imageId: '1', yTrue: 'A', yPred: 'A', confidence: 0.9 },
    { imageId: '2', yTrue: 'A', yPred: 'A', confidence: 0.8 },
  ];

  // Pass known class 'B' that had zero instances
  const { metrics } = evaluateMulticlassVisionMetrics(records, ['A', 'B']);

  const classB = metrics.perClass['B'];
  assert.equal(classB.support, 0);
  assert.equal(classB.precision, null, 'Must be null, not NaN or 0');
  assert.equal(classB.recall, null, 'Must be null, not NaN or 0');
  assert.equal(classB.f1Score, null, 'Must be null, not NaN or 0');
});

test('multiclass-metrics: categorizes failures and flags high-confidence errors', () => {
  const records = [
    { imageId: '1', yTrue: '1', yPred: '1', confidence: 0.95 }, // CORRECT_HIGH_CONF
    { imageId: '2', yTrue: '1', yPred: '1', confidence: 0.55 }, // CORRECT_LOW_CONF
    { imageId: '3', yTrue: '0', yPred: '1', confidence: 0.92 }, // INCORRECT_HIGH_CONF (Dangerous silent failure)
    { imageId: '4', yTrue: '1', yPred: '0', confidence: 0.60 }, // INCORRECT_LOW_CONF
  ];

  const { metrics, evaluatedRecords } = evaluateMulticlassVisionMetrics(records);

  assert.equal(metrics.highConfidenceErrorCount, 1);
  assert.equal(metrics.lowConfidenceCorrectCount, 1);

  assert.equal(evaluatedRecords[0].failureCategory, 'CORRECT_HIGH_CONF');
  assert.equal(evaluatedRecords[0].outcome, 'TRUE_POSITIVE');

  assert.equal(evaluatedRecords[1].failureCategory, 'CORRECT_LOW_CONF');
  assert.equal(evaluatedRecords[1].outcome, 'TRUE_POSITIVE');

  assert.equal(evaluatedRecords[2].failureCategory, 'INCORRECT_HIGH_CONF');
  assert.equal(evaluatedRecords[2].outcome, 'FALSE_POSITIVE');

  assert.equal(evaluatedRecords[3].failureCategory, 'INCORRECT_LOW_CONF');
  assert.equal(evaluatedRecords[3].outcome, 'FALSE_NEGATIVE');
});

test('multiclass-metrics: evaluates predictions.csv synthetic fixture', () => {
  const csvPath = join(process.cwd(), 'public', 'fixtures', 'vision', 'predictions.csv');
  const content = readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n').slice(1);

  const records = lines.map((line) => {
    const parts = line.split(',');
    return {
      imageId: parts[0],
      yTrue: parts[1],
      yPred: parts[2],
      yProbability: parseFloat(parts[3]),
      split: parts[4],
      site: parts[5],
      device: parts[6],
    };
  });

  assert.equal(records.length, 200);

  const { metrics } = evaluateMulticlassVisionMetrics(records);
  assert.equal(metrics.totalSamples, 200);
  assert.ok(metrics.overallAccuracy > 0.5);
  assert.ok(metrics.perClass['0']);
  assert.ok(metrics.perClass['1']);
});
