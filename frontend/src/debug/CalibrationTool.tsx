import { useEffect, useMemo, useState } from 'react';
import * as ort from 'onnxruntime-web';
import sampleImageUrl from '../assets/hero.png';
import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import { recoverOriginalCoordinates } from '../ai/postprocess/CoordinateMapper';
import { decode } from '../ai/postprocess/Decoder';
import { classWiseNMS } from '../ai/postprocess/NMS';
import { runDetector } from '../ai/detector/Detector';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';
import { calculateGuidanceState } from '../guide/GuidanceEngine';
import { getTargetLayout, type CaptureAngle, type TargetLayout, type TargetPoint } from '../guide/TargetLayout';
import { VEHICLE_PROFILES, type VehicleId } from '../guide/VehicleProfiles';

interface CalibrationInput {
  detections: BoxDetection[];
  imageWidth: number;
  imageHeight: number;
}

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const ANGLES: CaptureAngle[] = ['front-left', 'front-right', 'rear-left', 'rear-right'];

type LayoutsByAngle = Record<CaptureAngle, TargetLayout>;
type LayoutsByVehicle = Record<VehicleId, LayoutsByAngle>;

function cloneLayout(layout: TargetLayout): TargetLayout {
  return {
    plate: { ...layout.plate },
    wheel: { ...layout.wheel },
    relation: layout.relation === undefined ? undefined : { ...layout.relation },
    expectedVehicleSize: layout.expectedVehicleSize === undefined ? undefined : { ...layout.expectedVehicleSize },
    tolerances: layout.tolerances === undefined ? undefined : { ...layout.tolerances },
  };
}

function createLayoutsFromDefaults(vehicleId: VehicleId): LayoutsByAngle {
  return {
    'front-left': cloneLayout(getTargetLayout(vehicleId, 'front-left')),
    'front-right': cloneLayout(getTargetLayout(vehicleId, 'front-right')),
    'rear-left': cloneLayout(getTargetLayout(vehicleId, 'rear-left')),
    'rear-right': cloneLayout(getTargetLayout(vehicleId, 'rear-right')),
  };
}

function createLayoutsByVehicle(): LayoutsByVehicle {
  return {
    yaris: createLayoutsFromDefaults('yaris'),
    'corolla-cross': createLayoutsFromDefaults('corolla-cross'),
    altis: createLayoutsFromDefaults('altis'),
    camry: createLayoutsFromDefaults('camry'),
    'yaris-cross': createLayoutsFromDefaults('yaris-cross'),
  };
}

function Slider({ label, min, max, step, value, onChange }: SliderProps): React.JSX.Element {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span>{label}: {value.toFixed(3)}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function formatPoint(
  point: { x: number; y: number } | undefined,
  imageWidth: number,
  imageHeight: number,
): string {
  if (point === undefined) {
    return 'Not detected';
  }

  return `Normalized x=${point.x.toFixed(3)}, y=${point.y.toFixed(3)}; Pixel x=${Math.round(point.x * imageWidth)}, y=${Math.round(point.y * imageHeight)}`;
}

function scoreColor(score: number): string {
  if (score >= 90) {
    return '#16a34a';
  }

  if (score >= 70) {
    return '#ea580c';
  }

  return '#dc2626';
}

/**
 * Internal target-layout editor. Its state is local to this page and is passed
 * to the pure GuidanceEngine as an override; production TargetLayout defaults
 * are never mutated.
 */
export function CalibrationTool(): React.JSX.Element {
  const [vehicleId, setVehicleId] = useState<VehicleId>('corolla-cross');
  const [angle, setAngle] = useState<CaptureAngle>('rear-right');
  const [openedLayouts] = useState<LayoutsByVehicle>(createLayoutsByVehicle);
  const [layouts, setLayouts] = useState<LayoutsByVehicle>(createLayoutsByVehicle);
  const [input, setInput] = useState<CalibrationInput>();
  const [error, setError] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<string>();
  const [showCompositionGrid, setShowCompositionGrid] = useState(true);
  const layout = layouts[vehicleId][angle];

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
            setError(caught instanceof Error ? caught.message : 'The calibration sample could not be processed.');
          }
        }
      })();
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The calibration sample image could not be loaded.');
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
      : calculateGuidanceState(input.detections, input.imageWidth, input.imageHeight, vehicleId, angle, layout),
    [angle, input, layout, vehicleId],
  );

  const updatePoint = (point: 'plate' | 'wheel', property: keyof TargetPoint, value: number): void => {
    setLayouts((current) => ({
      ...current,
      [vehicleId]: {
        ...current[vehicleId],
        [angle]: {
          ...current[vehicleId][angle],
          [point]: { ...current[vehicleId][angle][point], [property]: value },
        },
      },
    }));
  };

  const loadDefault = (): void => {
    setLayouts((current) => ({
      ...current,
      [vehicleId]: {
        ...current[vehicleId],
        [angle]: cloneLayout(getTargetLayout(vehicleId, angle)),
      },
    }));
    setCopyStatus('Loaded defaults for the selected capture angle.');
  };

  const reset = (): void => {
    setLayouts((current) => ({
      ...current,
      [vehicleId]: {
        ...current[vehicleId],
        [angle]: cloneLayout(openedLayouts[vehicleId][angle]),
      },
    }));
    setCopyStatus('Restored the values from when this page was opened.');
  };

  const changeAngle = (nextAngle: CaptureAngle): void => {
    setAngle(nextAngle);
    setCopyStatus(undefined);
  };

  const changeVehicle = (nextVehicleId: VehicleId): void => {
    setVehicleId(nextVehicleId);
    setCopyStatus(undefined);
  };

  const copyJson = (): void => {
    void navigator.clipboard.writeText(JSON.stringify(layout, null, 2))
      .then(() => setCopyStatus('Layout JSON copied.'))
      .catch(() => setCopyStatus('Could not copy layout JSON.'));
  };

  const imageWidth = input?.imageWidth ?? 1;
  const imageHeight = input?.imageHeight ?? 1;
  const toleranceRadius = Math.min(imageWidth, imageHeight);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1800, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Target layout calibration</h1>
      <p>Edits are local to this tool and update guidance immediately without changing production target defaults.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      <div style={{ alignItems: 'start', display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, 0.9fr) minmax(280px, 0.9fr)' }}>
        <section aria-label="Image and target overlay">
          <h2 style={{ marginTop: 0 }}>Preview</h2>
          <div style={{ position: 'relative' }}>
            <img
              alt="Calibration sample"
              src={sampleImageUrl}
              style={{ display: 'block', height: 'auto', maxWidth: '100%', width: '100%' }}
            />
            {guidance !== undefined && (
              <svg
                aria-label="Current and target positions"
                preserveAspectRatio="none"
                style={{ height: '100%', inset: 0, pointerEvents: 'none', position: 'absolute', width: '100%' }}
                viewBox={`0 0 ${imageWidth} ${imageHeight}`}
              >
                {showCompositionGrid && (
                  <>
                    <line stroke="rgba(255, 255, 255, 0.65)" strokeDasharray="12 8" strokeWidth="2" x1={imageWidth / 3} x2={imageWidth / 3} y1="0" y2={imageHeight} />
                    <line stroke="rgba(255, 255, 255, 0.65)" strokeDasharray="12 8" strokeWidth="2" x1={imageWidth * 2 / 3} x2={imageWidth * 2 / 3} y1="0" y2={imageHeight} />
                    <line stroke="rgba(255, 255, 255, 0.65)" strokeDasharray="12 8" strokeWidth="2" x1="0" x2={imageWidth} y1={imageHeight / 3} y2={imageHeight / 3} />
                    <line stroke="rgba(255, 255, 255, 0.65)" strokeDasharray="12 8" strokeWidth="2" x1="0" x2={imageWidth} y1={imageHeight * 2 / 3} y2={imageHeight * 2 / 3} />
                  </>
                )}
                <ellipse
                  cx={guidance.plateTarget.x * imageWidth}
                  cy={guidance.plateTarget.y * imageHeight}
                  fill="none"
                  rx={(layout.plate.tolerance ?? layout.plate.toleranceX) * toleranceRadius}
                  ry={(layout.plate.tolerance ?? layout.plate.toleranceY) * toleranceRadius}
                  stroke="#22c55e"
                  strokeDasharray="10 8"
                  strokeWidth="3"
                />
                <ellipse
                  cx={guidance.wheelTarget.x * imageWidth}
                  cy={guidance.wheelTarget.y * imageHeight}
                  fill="none"
                  rx={(layout.wheel.tolerance ?? layout.wheel.toleranceX) * toleranceRadius}
                  ry={(layout.wheel.tolerance ?? layout.wheel.toleranceY) * toleranceRadius}
                  stroke="#2563eb"
                  strokeDasharray="10 8"
                  strokeWidth="3"
                />
                {guidance.plateCurrent !== undefined && (
                  <line
                    stroke="#22c55e"
                    strokeWidth="3"
                    x1={guidance.plateCurrent.x * imageWidth}
                    x2={guidance.plateTarget.x * imageWidth}
                    y1={guidance.plateCurrent.y * imageHeight}
                    y2={guidance.plateTarget.y * imageHeight}
                  />
                )}
                {guidance.wheelCurrent !== undefined && (
                  <line
                    stroke="#2563eb"
                    strokeWidth="3"
                    x1={guidance.wheelCurrent.x * imageWidth}
                    x2={guidance.wheelTarget.x * imageWidth}
                    y1={guidance.wheelCurrent.y * imageHeight}
                    y2={guidance.wheelTarget.y * imageHeight}
                  />
                )}
                <rect
                  fill="#22c55e"
                  height="16"
                  width="16"
                  x={guidance.plateTarget.x * imageWidth - 8}
                  y={guidance.plateTarget.y * imageHeight - 8}
                />
                <rect
                  fill="#2563eb"
                  height="16"
                  width="16"
                  x={guidance.wheelTarget.x * imageWidth - 8}
                  y={guidance.wheelTarget.y * imageHeight - 8}
                />
                <text fill="#22c55e" fontSize="18" fontWeight="700" x={guidance.plateTarget.x * imageWidth + 12} y={guidance.plateTarget.y * imageHeight - 12}>PT</text>
                <text fill="#2563eb" fontSize="18" fontWeight="700" x={guidance.wheelTarget.x * imageWidth + 12} y={guidance.wheelTarget.y * imageHeight - 12}>WT</text>
                {guidance.plateCurrent !== undefined && (
                  <>
                    <circle
                      cx={guidance.plateCurrent.x * imageWidth}
                      cy={guidance.plateCurrent.y * imageHeight}
                      fill="#22c55e"
                      r="8"
                    />
                    <text fill="#22c55e" fontSize="18" fontWeight="700" x={guidance.plateCurrent.x * imageWidth + 12} y={guidance.plateCurrent.y * imageHeight - 12}>PC</text>
                  </>
                )}
                {guidance.wheelCurrent !== undefined && (
                  <>
                    <circle
                      cx={guidance.wheelCurrent.x * imageWidth}
                      cy={guidance.wheelCurrent.y * imageHeight}
                      fill="#2563eb"
                      r="8"
                    />
                    <text fill="#2563eb" fontSize="18" fontWeight="700" x={guidance.wheelCurrent.x * imageWidth + 12} y={guidance.wheelCurrent.y * imageHeight - 12}>WC</text>
                  </>
                )}
              </svg>
            )}
          </div>
          <p style={{ fontSize: 14 }}>Green: license plate. Blue: wheel. Circles are current centers; squares and dashed rings are editable targets and tolerances.</p>
        </section>

        <section aria-label="Target layout controls">
          <h2 style={{ marginTop: 0 }}>Target layout</h2>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Vehicle</span>
            <select value={vehicleId} onChange={(event) => changeVehicle(event.target.value as VehicleId)}>
              {VEHICLE_PROFILES.map((profile) => (
                <option key={profile.vehicleId} value={profile.vehicleId}>{profile.displayName}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Capture Angle</span>
            <select value={angle} onChange={(event) => changeAngle(event.target.value as CaptureAngle)}>
              {ANGLES.map((captureAngle) => <option key={captureAngle} value={captureAngle}>{captureAngle}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input checked={showCompositionGrid} onChange={(event) => setShowCompositionGrid(event.target.checked)} type="checkbox" />
            Show 3×3 composition grid
          </label>

          <fieldset style={{ border: '1px solid #d1d5db', display: 'grid', gap: 12, marginTop: 20 }}>
            <legend>Plate Target</legend>
            <Slider label="X" max={1} min={0} onChange={(value) => updatePoint('plate', 'x', value)} step={0.001} value={layout.plate.x} />
            <Slider label="Y" max={1} min={0} onChange={(value) => updatePoint('plate', 'y', value)} step={0.001} value={layout.plate.y} />
            <Slider label="Tolerance" max={0.3} min={0.01} onChange={(value) => updatePoint('plate', 'tolerance', value)} step={0.001} value={layout.plate.tolerance ?? layout.plate.toleranceX} />
          </fieldset>

          <fieldset style={{ border: '1px solid #d1d5db', display: 'grid', gap: 12, marginTop: 20 }}>
            <legend>Wheel Target</legend>
            <Slider label="X" max={1} min={0} onChange={(value) => updatePoint('wheel', 'x', value)} step={0.001} value={layout.wheel.x} />
            <Slider label="Y" max={1} min={0} onChange={(value) => updatePoint('wheel', 'y', value)} step={0.001} value={layout.wheel.y} />
            <Slider label="Tolerance" max={0.3} min={0.01} onChange={(value) => updatePoint('wheel', 'tolerance', value)} step={0.001} value={layout.wheel.tolerance ?? layout.wheel.toleranceX} />
          </fieldset>
        </section>

        <section aria-label="Live guidance information">
          <h2 style={{ marginTop: 0 }}>Live guidance</h2>
          {guidance !== undefined && (
            <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content 1fr' }}>
              <dt>Plate Error</dt><dd>{guidance.plateError.toFixed(4)}</dd>
              <dt>Wheel Error</dt><dd>{guidance.wheelError.toFixed(4)}</dd>
              <dt>Overall Score</dt><dd style={{ color: scoreColor(guidance.overallScore), fontWeight: 700 }}>{guidance.overallScore} %</dd>
              <dt>Ready</dt><dd>{guidance.ready ? '✅ READY' : '❌ NOT READY'}</dd>
              <dt>Hints</dt><dd>{guidance.hints.length === 0 ? 'None' : guidance.hints.join(', ')}</dd>
              <dt>Current Plate</dt><dd>{formatPoint(guidance.plateCurrent, imageWidth, imageHeight)}</dd>
              <dt>Current Wheel</dt><dd>{formatPoint(guidance.wheelCurrent, imageWidth, imageHeight)}</dd>
              <dt>Target Plate</dt><dd>{formatPoint(guidance.plateTarget, imageWidth, imageHeight)}</dd>
              <dt>Target Wheel</dt><dd>{formatPoint(guidance.wheelTarget, imageWidth, imageHeight)}</dd>
            </dl>
          )}
        </section>
      </div>

      <section aria-label="Calibration actions" style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button type="button" onClick={reset}>Reset</button>
        <button type="button" onClick={loadDefault}>Load Default</button>
        <button type="button" onClick={copyJson}>Copy JSON</button>
        {copyStatus !== undefined && <span>{copyStatus}</span>}
      </section>
    </main>
  );
}
