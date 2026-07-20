import test from 'node:test';
import assert from 'node:assert/strict';
import type { BoxDetection } from '../../../ai/postprocess/BoxConverter';
import { calculateGuidanceState } from '../../../guide/GuidanceEngine';
import { getTargetLayout, targetRegionToGuideRectangle } from '../../../guide/TargetLayout';
import { CAMERA_PREVIEW_MIRRORED } from '../../../pages/CameraAngleValidation';
import {
  calculateRenderedVideoFrame,
  createFixedCaptureTemplateGeometry,
  type RenderedVideoFrame,
} from './FixedCaptureTemplateGeometry';

const baseFrame: RenderedVideoFrame = {
  x: 0,
  y: 0,
  width: 1000,
  height: 500,
};

function detection(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  classId: number,
): BoxDetection {
  return {
    x1,
    y1,
    x2,
    y2,
    classId,
    confidence: 0.9,
  };
}

test('fixed template uses Yaris front-left plate TargetLayout region', () => {
  const layout = getTargetLayout('yaris', 'front-left');
  const geometry = createFixedCaptureTemplateGeometry('yaris', 'front-left', baseFrame);
  const expected = targetRegionToGuideRectangle(layout.plate, baseFrame);

  assert.equal(layout.plate.x, 0.206);
  assert.equal(layout.plate.y, 0.704);
  assert.equal(layout.plate.width, 0.22);
  assert.equal(layout.plate.height, 0.08);
  assert.deepEqual(geometry.plate, expected);
});

test('fixed template uses Yaris front-left wheel TargetLayout region', () => {
  const layout = getTargetLayout('yaris', 'front-left');
  const geometry = createFixedCaptureTemplateGeometry('yaris', 'front-left', baseFrame);
  const expected = targetRegionToGuideRectangle(layout.wheel, baseFrame);

  assert.equal(layout.wheel.x, 0.716);
  assert.equal(layout.wheel.y, 0.704);
  assert.equal(layout.wheel.width, 0.20);
  assert.equal(layout.wheel.height, 0.20);
  assert.deepEqual(geometry.wheel, expected);
});

test('changing live detection coordinates does not change fixed template geometry', () => {
  const firstDetections = [
    detection(10, 20, 110, 60, 0),
    detection(700, 340, 820, 440, 1),
  ];
  const secondDetections = [
    detection(600, 300, 780, 380, 0),
    detection(80, 330, 260, 470, 1),
  ];
  const firstGeometry = createFixedCaptureTemplateGeometry('yaris', 'front-left', baseFrame);
  const secondGeometry = createFixedCaptureTemplateGeometry('yaris', 'front-left', baseFrame);

  assert.notDeepEqual(firstDetections, secondDetections);
  assert.deepEqual(secondGeometry, firstGeometry);
});

test('changing capture angle changes fixed template geometry', () => {
  const frontLeft = createFixedCaptureTemplateGeometry('yaris', 'front-left', baseFrame);
  const frontRight = createFixedCaptureTemplateGeometry('yaris', 'front-right', baseFrame);

  assert.notDeepEqual(frontRight, frontLeft);
});

test('resizing displayed video frame scales fixed template rectangles proportionally', () => {
  const normal = createFixedCaptureTemplateGeometry('yaris', 'front-left', baseFrame);
  const doubled = createFixedCaptureTemplateGeometry('yaris', 'front-left', {
    x: 0,
    y: 0,
    width: baseFrame.width * 2,
    height: baseFrame.height * 2,
  });

  assert.equal(doubled.plate.x, normal.plate.x * 2);
  assert.equal(doubled.plate.y, normal.plate.y * 2);
  assert.equal(doubled.plate.width, normal.plate.width * 2);
  assert.equal(doubled.plate.height, normal.plate.height * 2);
  assert.equal(doubled.wheel.x, normal.wheel.x * 2);
  assert.equal(doubled.wheel.y, normal.wheel.y * 2);
  assert.equal(doubled.wheel.width, normal.wheel.width * 2);
  assert.equal(doubled.wheel.height, normal.wheel.height * 2);
});

test('rendered video frame accounts for contain letterboxing', () => {
  const renderedFrame = calculateRenderedVideoFrame(
    { width: 400, height: 400 },
    { width: 1600, height: 800 },
    'contain',
  );

  assert.deepEqual(renderedFrame, {
    x: 0,
    y: 100,
    width: 400,
    height: 200,
  });
});

test('fixed UI template and GuidanceEngine resolve the same vehicle and angle layout', () => {
  const layout = getTargetLayout('yaris', 'front-left');
  const guidance = calculateGuidanceState([], 1000, 500, 'yaris', 'front-left');
  const geometry = createFixedCaptureTemplateGeometry('yaris', 'front-left', baseFrame);

  assert.deepEqual(guidance.plateTarget, { x: layout.plate.x, y: layout.plate.y });
  assert.deepEqual(guidance.wheelTarget, { x: layout.wheel.x, y: layout.wheel.y });
  assert.equal((geometry.plate.x + geometry.plate.width / 2) / baseFrame.width, layout.plate.x);
  assert.equal((geometry.wheel.x + geometry.wheel.width / 2) / baseFrame.width, layout.wheel.x);
});

test('rear camera preview remains unmirrored for guided capture', () => {
  assert.equal(CAMERA_PREVIEW_MIRRORED, false);
});
