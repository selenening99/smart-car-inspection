import test from 'node:test';
import assert from 'node:assert/strict';
import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import {
  buildCalibrationObservationFromDetections,
  createCalibrationPairGeometry,
  normalizeDetectionRegion,
  type CalibrationObservation,
} from './CalibrationObservation';
import { buildCalibrationQualityReport } from './CalibrationQuality';
import { detectCalibrationOutliers } from './CalibrationOutlierDetector';
import { angularStatistics, median, robustSpread } from './CalibrationStatistics';
import { LocalStorageCalibrationRepository, type KeyValueStorage } from './LocalStorageCalibrationRepository';
import { generateTargetLayout } from './TargetLayoutGenerator';
import { AutoCaptureController, AutoCaptureState } from '../capture/AutoCaptureController';
import { calculateGuidanceState, selectTargetWheel } from '../guide/GuidanceEngine';
import {
  angleLabel,
  type CaptureAngle,
  deriveTargetRelation,
  getTargetLayout,
  resolveTargetLayout,
  targetRegionToGuideRectangle,
  type TargetLayout,
  type TargetRegion,
} from '../guide/TargetLayout';
import {
  CAMERA_CAPTURE_ANGLES,
  CAMERA_PREVIEW_MIRRORED,
  YARIS_ANGLE_COORDINATE_REFERENCE,
  createCapturedImageUploadInput,
  resetAngleDependentCaptureState,
  validateSelectedAngleLayout,
} from '../pages/CameraAngleValidation';

function box(x1: number, y1: number, x2: number, y2: number, classId: number, confidence: number): BoxDetection {
  return { x1, y1, x2, y2, classId, confidence };
}

function observation(id: string, overrides: Partial<CalibrationObservation> = {}): CalibrationObservation {
  const plate = overrides.plate ?? { centerX: 0.58, centerY: 0.49, width: 0.2, height: 0.08, confidence: 0.9 };
  const wheel = overrides.wheel ?? { centerX: 0.35, centerY: 0.72, width: 0.18, height: 0.18, confidence: 0.88 };

  return {
    id,
    vehicleId: 'yaris',
    vehicleDisplayName: 'Toyota Yaris',
    captureAngle: 'rear-right',
    capturedAt: '2026-07-19T00:00:00.000Z',
    imageWidth: 1000,
    imageHeight: 1000,
    plate,
    wheel,
    pair: createCalibrationPairGeometry(plate, wheel),
    wheelSelection: {
      candidateCount: 1,
      selectedConfidence: wheel.confidence,
      selectedCenter: { x: wheel.centerX, y: wheel.centerY },
      distanceFromTarget: 0,
      strategy: 'single-candidate',
    },
    source: 'live-camera',
    accepted: true,
    ...overrides,
  };
}

class MemoryStorage implements KeyValueStorage {
  private readonly data = new Map<string, string>();

  public get length(): number {
    return this.data.size;
  }

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  public removeItem(key: string): void {
    this.data.delete(key);
  }

  public key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
}

const measuredYarisCenters: Record<CaptureAngle, {
  plate: { x: number; y: number };
  wheel: { x: number; y: number };
}> = {
  'front-left': {
    plate: { x: 0.206, y: 0.704 },
    wheel: { x: 0.716, y: 0.704 },
  },
  'front-right': {
    plate: { x: 0.818, y: 0.755 },
    wheel: { x: 0.335, y: 0.731 },
  },
  'rear-left': {
    plate: { x: 0.753, y: 0.636 },
    wheel: { x: 0.320, y: 0.735 },
  },
  'rear-right': {
    plate: { x: 0.320, y: 0.735 },
    wheel: { x: 0.730, y: 0.814 },
  },
};

const captureAngles = Object.keys(measuredYarisCenters) as CaptureAngle[];

function assertYarisMeasuredCenters(angle: CaptureAngle): void {
  const layout = getTargetLayout('yaris', angle);
  const expected = measuredYarisCenters[angle];

  assert.equal(layout.plate.x, expected.plate.x);
  assert.equal(layout.plate.y, expected.plate.y);
  assert.equal(layout.wheel.x, expected.wheel.x);
  assert.equal(layout.wheel.y, expected.wheel.y);
}

function boxFromTargetRegion(target: TargetRegion, classId: number, confidence: number): BoxDetection {
  const imageSize = 1000;

  return box(
    (target.x - target.width / 2) * imageSize,
    (target.y - target.height / 2) * imageSize,
    (target.x + target.width / 2) * imageSize,
    (target.y + target.height / 2) * imageSize,
    classId,
    confidence,
  );
}

test('selectTargetWheel selects the closest target wheel', () => {
  const wheels = [
    box(700, 700, 800, 800, 1, 0.99),
    box(300, 700, 400, 800, 1, 0.8),
  ];
  const selected = selectTargetWheel(wheels, 1000, 1000, { x: 0.35, y: 0.75 });

  assert.equal(selected, wheels[1]);
});

test('selectTargetWheel uses confidence only as a distance tie-breaker', () => {
  const wheels = [
    box(300, 700, 400, 800, 1, 0.7),
    box(300, 700, 400, 800, 1, 0.95),
  ];
  const selected = selectTargetWheel(wheels, 1000, 1000, { x: 0.35, y: 0.75 });

  assert.equal(selected, wheels[1]);
});

test('rear-right remains mapped to rear-right', () => {
  const layout = getTargetLayout('yaris', 'rear-right');

  assert.equal(angleLabel('rear-right'), '右後方');
  assert.equal(layout.metadata?.captureAngle, 'rear-right');
});

test('angleLabel returns Traditional Chinese labels for all four angles', () => {
  assert.equal(angleLabel('front-left'), '左前方');
  assert.equal(angleLabel('front-right'), '右前方');
  assert.equal(angleLabel('rear-left'), '左後方');
  assert.equal(angleLabel('rear-right'), '右後方');
});

test('Yaris front-left centers match measured values', () => {
  assertYarisMeasuredCenters('front-left');
});

test('Yaris front-right centers match measured values', () => {
  assertYarisMeasuredCenters('front-right');
});

test('Yaris rear-left centers match measured values', () => {
  assertYarisMeasuredCenters('rear-left');
});

test('Yaris rear-right centers match measured values', () => {
  assertYarisMeasuredCenters('rear-right');
});

test('Yaris metadata captureAngle matches each captureLayouts key', () => {
  for (const angle of captureAngles) {
    const layout = getTargetLayout('yaris', angle);

    assert.equal(layout.metadata?.captureAngle, angle);
    assert.equal(layout.metadata?.vehicleId, 'yaris');
    assert.equal(layout.metadata?.calibrationSource, 'manual-baseline');
    assert.equal(layout.metadata?.calibrationSampleCount, 1);
  }
});

test('Yaris relation equals deriveTargetRelation for every measured layout', () => {
  for (const angle of captureAngles) {
    const layout = getTargetLayout('yaris', angle);
    const expectedRelation = deriveTargetRelation(layout.plate, layout.wheel);

    assert.deepEqual(layout.relation, expectedRelation);
  }
});

test('Yaris layouts are not generated by horizontal mirroring', () => {
  const frontLeft = getTargetLayout('yaris', 'front-left');
  const frontRight = getTargetLayout('yaris', 'front-right');
  const rearLeft = getTargetLayout('yaris', 'rear-left');
  const rearRight = getTargetLayout('yaris', 'rear-right');

  assert.notEqual(frontLeft.plate.x, Number((1 - frontRight.plate.x).toFixed(3)));
  assert.notEqual(frontLeft.wheel.x, Number((1 - frontRight.wheel.x).toFixed(3)));
  assert.notEqual(rearLeft.plate.x, Number((1 - rearRight.plate.x).toFixed(3)));
  assert.notEqual(rearLeft.wheel.x, Number((1 - rearRight.wheel.x).toFixed(3)));
});

test('getTargetLayout returns the explicit Yaris layout for every angle', () => {
  for (const angle of captureAngles) {
    assertYarisMeasuredCenters(angle);
    assert.equal(getTargetLayout('yaris', angle).metadata?.schemaVersion, 2);
  }
});

test('selected angle loads the matching explicit Yaris layout', () => {
  for (const angle of CAMERA_CAPTURE_ANGLES) {
    const layout = getTargetLayout('yaris', angle);
    const reference = YARIS_ANGLE_COORDINATE_REFERENCE[angle];

    assert.equal(layout.metadata?.captureAngle, angle);
    assert.equal(layout.plate.x, reference.plate.x);
    assert.equal(layout.plate.y, reference.plate.y);
    assert.equal(layout.wheel.x, reference.wheel.x);
    assert.equal(layout.wheel.y, reference.wheel.y);
  }
});

test('angle change reset helper returns auto-capture to idle', () => {
  const layout = getTargetLayout('yaris', 'rear-right');
  const guidance = calculateGuidanceState([
    boxFromTargetRegion(layout.plate, 0, 0.95),
    boxFromTargetRegion(layout.wheel, 1, 0.92),
  ], 1000, 1000, 'yaris', 'rear-right');
  const controller = new AutoCaptureController();

  assert.equal(controller.update(guidance, 1000), AutoCaptureState.CountingDown);
  assert.equal(resetAngleDependentCaptureState(controller), AutoCaptureState.Idle);
  assert.equal(controller.state, AutoCaptureState.Idle);
});

test('mismatched metadata.captureAngle produces a guarded error', () => {
  const guard = validateSelectedAngleLayout('front-left', {
    metadata: {
      captureAngle: 'rear-right',
    },
  });

  assert.equal(guard.valid, false);
  assert.match(guard.error ?? '', /selected front-left, metadata rear-right/);
});

test('upload metadata uses the selected angle rather than a page constant', () => {
  const blob = new Blob(['test-image']);
  const layout = getTargetLayout('yaris', 'front-right');
  const uploadInput = createCapturedImageUploadInput({
    blob,
    vehicleId: 'yaris',
    selectedAngle: 'front-right',
    captureSource: 'manual',
    guidance: undefined,
    targetLayout: layout,
    capturedAt: '2026-07-19T00:00:00.000Z',
  });

  assert.equal(uploadInput.captureAngle, 'front-right');
  assert.equal(uploadInput.targetPlateCenter.x, layout.plate.x);
  assert.equal(uploadInput.targetWheelCenter.x, layout.wheel.x);
});

test('rear camera preview remains unmirrored', () => {
  assert.equal(CAMERA_PREVIEW_MIRRORED, false);
});

test('all four measured coordinate references remain unchanged', () => {
  for (const angle of captureAngles) {
    assert.deepEqual(YARIS_ANGLE_COORDINATE_REFERENCE[angle], measuredYarisCenters[angle]);
  }
});

test('normalized detection-region calculation uses image dimensions', () => {
  const region = normalizeDetectionRegion(box(100, 200, 300, 260, 0, 0.91), 1000, 500);

  assert.deepEqual(region, {
    centerX: 0.2,
    centerY: 0.46,
    width: 0.2,
    height: 0.12,
    confidence: 0.91,
  });
});

test('paired observation geometry keeps plate and wheel from one frame together', () => {
  const pair = createCalibrationPairGeometry(
    { centerX: 0.6, centerY: 0.5 },
    { centerX: 0.3, centerY: 0.7 },
  );

  assert.equal(Number(pair.midpointX.toFixed(3)), 0.45);
  assert.equal(pair.midpointY, 0.6);
  assert.equal(pair.dx, -0.3);
  assert.equal(pair.dy, 0.19999999999999996);
});

test('median calculation is deterministic', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([5, 1, 3, 7]), 4);
});

test('robust spread uses scaled median absolute deviation', () => {
  assert.equal(Number(robustSpread([1, 2, 3, 4, 100]).toFixed(4)), 1.4826);
});

test('outlier detection marks observations without deleting them', () => {
  const observations = [
    observation('1'),
    observation('2', { plate: { centerX: 0.581, centerY: 0.49, width: 0.2, height: 0.08, confidence: 0.9 } }),
    observation('3', { plate: { centerX: 0.9, centerY: 0.1, width: 0.2, height: 0.08, confidence: 0.9 } }),
  ];
  const analysis = detectCalibrationOutliers(observations);

  assert.equal(analysis.results.length, 3);
  assert.equal(analysis.excluded.length, 1);
});

test('angular statistics handle wraparound near -pi/pi', () => {
  const stats = angularStatistics([Math.PI - 0.01, -Math.PI + 0.01, Math.PI - 0.02]);

  assert.ok(Math.abs(Math.abs(stats.center) - Math.PI) < 0.03);
});

test('generated plate and wheel centers are reconstructed from paired medians', () => {
  const result = generateTargetLayout([
    observation('1'),
    observation('2', {
      plate: { centerX: 0.6, centerY: 0.5, width: 0.22, height: 0.08, confidence: 0.9 },
      wheel: { centerX: 0.36, centerY: 0.73, width: 0.2, height: 0.19, confidence: 0.9 },
    }),
  ]);

  assert.equal(Number(result.layout.plate.x.toFixed(3)), 0.59);
  assert.equal(Number(result.layout.wheel.x.toFixed(3)), 0.355);
});

test('generated relation stays consistent with plate and wheel centers', () => {
  const result = generateTargetLayout([observation('1'), observation('2')]);
  const expected = deriveTargetRelation(result.layout.plate, result.layout.wheel);

  assert.equal(result.layout.relation?.dx, expected.dx);
  assert.equal(result.layout.relation?.dy, expected.dy);
});

test('legacy TargetPoint conversion marks resolved layout as legacy', () => {
  const layout = resolveTargetLayout({
    plate: { x: 0.5, y: 0.5, tolerance: 0.1 },
    wheel: { x: 0.3, y: 0.7, tolerance: 0.12 },
  });

  assert.equal(layout.isLegacy, true);
  assert.equal(layout.plate.toleranceX, 0.1);
  assert.ok(layout.plate.width > layout.plate.height);
});

test('TargetRegion guide dimensions use object width and height', () => {
  const rectangle = targetRegionToGuideRectangle({
    x: 0.5,
    y: 0.5,
    width: 0.2,
    height: 0.1,
    toleranceX: 0.02,
    toleranceY: 0.02,
  }, { width: 1000, height: 500 });

  assert.equal(rectangle.width, 200);
  assert.equal(rectangle.height, 50);
  assert.equal(rectangle.x, 400);
  assert.equal(rectangle.y, 225);
});

test('independent X/Y readiness tolerances reject X even when Y passes', () => {
  const layout: TargetLayout = {
    plate: { x: 0.5, y: 0.5, width: 0.2, height: 0.08, toleranceX: 0.01, toleranceY: 0.2 },
    wheel: { x: 0.3, y: 0.7, width: 0.2, height: 0.2, toleranceX: 0.2, toleranceY: 0.2 },
    tolerances: {
      translationX: 1,
      translationY: 1,
      scale: 1,
      angleRadians: Math.PI,
      plateFineX: 0.01,
      plateFineY: 0.2,
      wheelFineX: 0.2,
      wheelFineY: 0.2,
    },
  };
  const guidance = calculateGuidanceState([
    box(520, 480, 620, 520, 0, 0.9),
    box(250, 650, 350, 750, 1, 0.9),
  ], 1000, 1000, 'yaris', 'rear-right', layout);

  assert.equal(guidance.componentReady.plate, false);
  assert.equal(guidance.ready, false);
});

test('insufficient-sample quality warning is emitted', () => {
  const quality = buildCalibrationQualityReport({
    sampleCount: 10,
    includedSampleCount: 10,
    outlierCount: 0,
    plateCenterSpreadX: 0.01,
    plateCenterSpreadY: 0.01,
    wheelCenterSpreadX: 0.01,
    wheelCenterSpreadY: 0.01,
    plateWidthSpread: 0.01,
    plateHeightSpread: 0.01,
    wheelWidthSpread: 0.01,
    wheelHeightSpread: 0.01,
    pairDistanceSpread: 0.01,
    pairAngleSpread: 0.01,
  });

  assert.equal(quality.quality, 'insufficient');
  assert.ok(quality.warnings.length > 0);
});

test('localStorage malformed-data recovery returns an empty list', () => {
  const storage = new MemoryStorage();
  storage.setItem('ai-vehicle-calibration:v1:yaris:rear-right', '{broken');
  const repository = new LocalStorageCalibrationRepository(storage);

  assert.deepEqual(repository.list('yaris', 'rear-right'), []);
});

test('buildCalibrationObservationFromDetections includes wheel-selection diagnostics', () => {
  const built = buildCalibrationObservationFromDetections({
    id: 'sample',
    vehicleId: 'yaris',
    vehicleDisplayName: 'Toyota Yaris',
    captureAngle: 'rear-right',
    capturedAt: '2026-07-19T00:00:00.000Z',
    imageWidth: 1000,
    imageHeight: 1000,
    detections: [
      box(550, 450, 650, 530, 0, 0.95),
      box(700, 650, 800, 800, 1, 0.99),
      box(300, 650, 400, 800, 1, 0.8),
    ],
    targetWheel: { x: 0.35, y: 0.72 },
    source: 'live-camera',
    accepted: true,
    confidenceThreshold: 0.25,
  });

  assert.equal(built.wheelSelection.candidateCount, 2);
  assert.equal(built.wheel.centerX, 0.35);
});
