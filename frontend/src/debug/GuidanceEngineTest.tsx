import { useEffect, useMemo, useState } from 'react';
import * as ort from 'onnxruntime-web';
import sampleImageUrl from '../assets/hero.png';
import { runDetector } from '../ai/detector/Detector';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import { recoverOriginalCoordinates } from '../ai/postprocess/CoordinateMapper';
import { decode } from '../ai/postprocess/Decoder';
import { classWiseNMS } from '../ai/postprocess/NMS';
import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import { calculateGuidanceState } from '../guide/GuidanceEngine';
import type { CaptureAngle } from '../guide/TargetLayout';
import type { VehicleId } from '../guide/VehicleProfiles';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

interface GuidanceDebugInput {
  detections: BoxDetection[];
  imageWidth: number;
  imageHeight: number;
}

const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const ANGLES: CaptureAngle[] = ['front-left', 'front-right', 'rear-left', 'rear-right'];
const VEHICLE_ID: VehicleId = 'corolla-cross';

function formatAngle(angle: CaptureAngle): string {
  if (angle === 'front-left') {
    return '左前方';
  }

  if (angle === 'front-right') {
    return '右前方';
  }

  if (angle === 'rear-left') {
    return '左後方';
  }

  return '右後方';
}

function formatPoint(point: { x: number; y: number } | undefined): string {
  return point === undefined ? 'Not detected' : `x: ${point.x.toFixed(4)}, y: ${point.y.toFixed(4)}`;
}

function formatDelta(delta: { dx: number; dy: number }): string {
  return `dx: ${delta.dx.toFixed(4)}, dy: ${delta.dy.toFixed(4)}`;
}

function getScoreColor(score: number): string {
  if (score >= 90) {
    return '#16a34a';
  }

  if (score >= 70) {
    return '#ea580c';
  }

  return '#dc2626';
}

/**
 * A live React inspection view: changing the capture angle recalculates and
 * immediately displays all guidance values from the current sample detections.
 */
export function GuidanceEngineTest(): React.JSX.Element {
  const [angle, setAngle] = useState<CaptureAngle>('rear-right');
  const [input, setInput] = useState<GuidanceDebugInput>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    const image = new Image();

    image.onload = () => {
      void (async () => {
        try {
          const letterboxed = letterbox(image, image.naturalWidth, image.naturalHeight);
          const tensor = preprocess(letterboxed);
          const session = await ort.InferenceSession.create(`${import.meta.env.BASE_URL}best.onnx`, {
            executionProviders: ['wasm'],
          });
          const output = await runDetector(session, tensor);
          const decoded = decode(output);
          const confidenceFiltered = filterByConfidence(decoded.detections, CONFIDENCE_THRESHOLD);
          const converted = convertXYWHToXYXY(confidenceFiltered);
          const selected = classWiseNMS(converted, IOU_THRESHOLD);
          const detections = recoverOriginalCoordinates(
            selected,
            letterboxed.scale,
            letterboxed.padX,
            letterboxed.padY,
            { width: image.naturalWidth, height: image.naturalHeight },
          );

          if (isMounted) {
            setInput({ detections, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight });
          }
        } catch (caught) {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : 'The guidance engine test failed.');
          }
        }
      })();
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The guidance sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  const guidance = useMemo(
    () => input === undefined
      ? undefined
      : calculateGuidanceState(input.detections, input.imageWidth, input.imageHeight, VEHICLE_ID, angle),
    [angle, input],
  );

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 900, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Guidance engine verification</h1>
      <p>Values recalculate immediately when the capture angle changes.</p>

      <label>
        Capture angle{' '}
        <select value={angle} onChange={(event) => setAngle(event.target.value as CaptureAngle)}>
          {ANGLES.map((captureAngle) => <option key={captureAngle} value={captureAngle}>{formatAngle(captureAngle)} ({captureAngle})</option>)}
        </select>
      </label>

      {error !== undefined && <p role="alert">{error}</p>}

      {guidance !== undefined && (
        <section aria-label="Guidance state" style={{ marginTop: 24 }}>
          <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content 1fr' }}>
            <dt>Current Plate</dt><dd>{formatPoint(guidance.plateCurrent)}</dd>
            <dt>Target Plate</dt><dd>{formatPoint(guidance.plateTarget)}</dd>
            <dt>Current Wheel</dt><dd>{formatPoint(guidance.wheelCurrent)}</dd>
            <dt>Target Wheel</dt><dd>{formatPoint(guidance.wheelTarget)}</dd>
            <dt>Plate Delta</dt><dd>{formatDelta(guidance.plateDelta)}</dd>
            <dt>Wheel Delta</dt><dd>{formatDelta(guidance.wheelDelta)}</dd>
            <dt>Plate Error</dt><dd>{guidance.plateError.toFixed(4)}</dd>
            <dt>Wheel Error</dt><dd>{guidance.wheelError.toFixed(4)}</dd>
            <dt>Overall Score</dt><dd style={{ color: getScoreColor(guidance.overallScore), fontWeight: 700 }}>{guidance.overallScore} %</dd>
            <dt>Ready</dt><dd>{guidance.ready ? '✅ READY' : '❌ NOT READY'}</dd>
            <dt>Hints</dt><dd>{guidance.hints.length === 0 ? 'None' : guidance.hints.join(', ')}</dd>
          </dl>
        </section>
      )}
    </main>
  );
}
