import { useState } from 'react';
import * as ort from 'onnxruntime-web';
import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import { recoverOriginalCoordinates } from '../ai/postprocess/CoordinateMapper';
import { decode } from '../ai/postprocess/Decoder';
import { classWiseNMS } from '../ai/postprocess/NMS';
import { runDetector } from '../ai/detector/Detector';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';
import type { TargetLayout, TargetRegion } from '../guide/TargetLayout';

interface Point {
  x: number;
  y: number;
}

interface AxisStatistics {
  mean: number;
  median: number;
  standardDeviation: number;
}

interface PointStatistics {
  x: AxisStatistics;
  y: AxisStatistics;
}

interface DatasetRecord {
  fileName: string;
  plate: Point;
  wheel: Point;
}

interface DatasetAnalysis {
  records: DatasetRecord[];
  rejectedImages: number;
  plateStatistics: PointStatistics;
  wheelStatistics: PointStatistics;
  recommendedLayout: TargetLayout;
  averageScore: number;
}

const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;

function calculateAxisStatistics(values: number[]): AxisStatistics {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const standardDeviation = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
  );

  return { mean, median, standardDeviation };
}

function calculatePointStatistics(points: Point[]): PointStatistics {
  return {
    x: calculateAxisStatistics(points.map((point) => point.x)),
    y: calculateAxisStatistics(points.map((point) => point.y)),
  };
}

function recommendTarget(statistics: PointStatistics, objectType: 'plate' | 'wheel'): TargetRegion {
  const tolerance = Math.min(
    0.3,
    Math.max(0.01, Math.hypot(statistics.x.standardDeviation, statistics.y.standardDeviation) * 2),
  );

  return {
    x: statistics.x.median,
    y: statistics.y.median,
    width: objectType === 'plate' ? tolerance * 2.4 : tolerance * 2,
    height: objectType === 'plate' ? tolerance * 0.8 : tolerance * 2,
    toleranceX: tolerance,
    toleranceY: tolerance,
    tolerance,
  };
}

function centerOf(detection: BoxDetection, imageWidth: number, imageHeight: number): Point {
  return {
    x: (detection.x1 + detection.x2) / 2 / imageWidth,
    y: (detection.y1 + detection.y2) / 2 / imageHeight,
  };
}

function highestConfidenceDetection(detections: BoxDetection[], classId: number): BoxDetection | undefined {
  return [...detections]
    .filter((detection) => detection.classId === classId)
    .sort((a, b) => b.confidence - a.confidence)[0];
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not load ${file.name}.`));
    };
    image.src = objectUrl;
  });
}

function buildAnalysis(records: DatasetRecord[], datasetSize: number): DatasetAnalysis {
  const plateStatistics = calculatePointStatistics(records.map((record) => record.plate));
  const wheelStatistics = calculatePointStatistics(records.map((record) => record.wheel));
  const recommendedLayout: TargetLayout = {
    plate: recommendTarget(plateStatistics, 'plate'),
    wheel: recommendTarget(wheelStatistics, 'wheel'),
  };
  const averageScore = records.reduce((sum, record) => {
    const plateError = Math.hypot(
      record.plate.x - recommendedLayout.plate.x,
      record.plate.y - recommendedLayout.plate.y,
    );
    const wheelError = Math.hypot(
      record.wheel.x - recommendedLayout.wheel.x,
      record.wheel.y - recommendedLayout.wheel.y,
    );
    const plateScore = Math.max(0, 1 - plateError / (recommendedLayout.plate.tolerance ?? recommendedLayout.plate.toleranceX));
    const wheelScore = Math.max(0, 1 - wheelError / (recommendedLayout.wheel.tolerance ?? recommendedLayout.wheel.toleranceX));

    return sum + (plateScore + wheelScore) / 2 * 100;
  }, 0) / records.length;

  return {
    records,
    rejectedImages: datasetSize - records.length,
    plateStatistics,
    wheelStatistics,
    recommendedLayout,
    averageScore,
  };
}

function StatisticsTable({ label, statistics }: { label: string; statistics: PointStatistics }): React.JSX.Element {
  return (
    <section>
      <h3>{label}</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr><th style={{ textAlign: 'left' }}>Axis</th><th>Mean</th><th>Median</th><th>Std. Dev.</th></tr>
        </thead>
        <tbody>
          <tr><td>x</td><td>{statistics.x.mean.toFixed(4)}</td><td>{statistics.x.median.toFixed(4)}</td><td>{statistics.x.standardDeviation.toFixed(4)}</td></tr>
          <tr><td>y</td><td>{statistics.y.mean.toFixed(4)}</td><td>{statistics.y.median.toFixed(4)}</td><td>{statistics.y.standardDeviation.toFixed(4)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}

/**
 * Internal batch tool for estimating a target layout from a selected image list.
 * It is independent from CalibrationTool and does not modify shared layouts.
 */
export function DatasetCalibration(): React.JSX.Element {
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<DatasetAnalysis>();
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<string>();

  const analyze = (): void => {
    void (async () => {
      if (files.length === 0) {
        setError('Select one or more image files before running calibration.');
        return;
      }

      setAnalysis(undefined);
      setError(undefined);
      setCopyStatus(undefined);
      const session = await ort.InferenceSession.create(`${import.meta.env.BASE_URL}best.onnx`, {
        executionProviders: ['wasm'],
      });
      const records: DatasetRecord[] = [];

      for (const [index, file] of files.entries()) {
        setProgress(`Processing ${index + 1} of ${files.length}: ${file.name}`);

        try {
          const image = await loadImage(file);
          const letterboxed = letterbox(image, image.naturalWidth, image.naturalHeight);
          const tensor = preprocess(letterboxed);
          const output = await runDetector(session, tensor);
          const decoded = decode(output);
          const confidenceFiltered = filterByConfidence(decoded.detections, CONFIDENCE_THRESHOLD);
          const converted = convertXYWHToXYXY(confidenceFiltered);
          const selected = classWiseNMS(converted, IOU_THRESHOLD);
          const recovered = recoverOriginalCoordinates(
            selected,
            letterboxed.scale,
            letterboxed.padX,
            letterboxed.padY,
            { width: image.naturalWidth, height: image.naturalHeight },
          );
          const plate = highestConfidenceDetection(recovered, 0);
          const wheel = highestConfidenceDetection(recovered, 1);

          if (plate !== undefined && wheel !== undefined) {
            records.push({
              fileName: file.name,
              plate: centerOf(plate, image.naturalWidth, image.naturalHeight),
              wheel: centerOf(wheel, image.naturalWidth, image.naturalHeight),
            });
          }
        } catch {
          // Images that cannot be processed are counted as rejected below.
        }
      }

      if (records.length === 0) {
        setError('No valid images contained both a license plate and a wheel.');
        setProgress(undefined);
        return;
      }

      setAnalysis(buildAnalysis(records, files.length));
      setProgress(undefined);
    })().catch((caught) => {
      setError(caught instanceof Error ? caught.message : 'Dataset calibration failed.');
      setProgress(undefined);
    });
  };

  const exportJson = (): void => {
    if (analysis === undefined) {
      return;
    }

    const blob = new Blob([JSON.stringify(analysis.recommendedLayout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recommended-target-layout.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = (): void => {
    if (analysis === undefined) {
      return;
    }

    void navigator.clipboard.writeText(JSON.stringify(analysis.recommendedLayout, null, 2))
      .then(() => setCopyStatus('Recommended layout JSON copied.'))
      .catch(() => setCopyStatus('Could not copy recommended layout JSON.'));
  };

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1400, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Dataset target-layout calibration</h1>
      <p>Select a homogeneous image list for one vehicle/capture angle. Every image runs through the v2 ONNX pipeline and contributes normalized plate/wheel centers when both are detected.</p>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <label>
          Image list{' '}
          <input
            accept="image/jpeg,image/png"
            multiple
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              setAnalysis(undefined);
              setError(undefined);
              setCopyStatus(undefined);
            }}
            type="file"
          />
        </label>
        <button onClick={analyze} type="button">Analyze Dataset</button>
      </section>

      <p>Selected images: {files.length}</p>
      {progress !== undefined && <p aria-live="polite">{progress}</p>}
      {error !== undefined && <p role="alert">{error}</p>}

      {analysis !== undefined && (
        <>
          <section aria-label="Dataset summary" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content', marginTop: 24 }}>
            <strong>Dataset Size</strong><span>{files.length}</span>
            <strong>Valid Images</strong><span>{analysis.records.length}</span>
            <strong>Rejected Images</strong><span>{analysis.rejectedImages}</span>
            <strong>Average Score</strong><span>{analysis.averageScore.toFixed(1)} %</span>
          </section>

          <section aria-label="Center statistics" style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginTop: 24 }}>
            <StatisticsTable label="Plate center" statistics={analysis.plateStatistics} />
            <StatisticsTable label="Wheel center" statistics={analysis.wheelStatistics} />
          </section>

          <section aria-label="Scatter plot" style={{ marginTop: 24 }}>
            <h2>Detected center scatter plot</h2>
            <svg style={{ background: '#f3f4f6', border: '1px solid #9ca3af', display: 'block', maxWidth: '100%' }} viewBox="0 0 600 600">
              {[0, 0.25, 0.5, 0.75, 1].map((position) => (
                <g key={position}>
                  <line stroke="#d1d5db" x1={position * 600} x2={position * 600} y1="0" y2="600" />
                  <line stroke="#d1d5db" x1="0" x2="600" y1={position * 600} y2={position * 600} />
                </g>
              ))}
              {analysis.records.map((record) => (
                <g key={record.fileName}>
                  <circle cx={record.plate.x * 600} cy={record.plate.y * 600} fill="#22c55e" r="4" />
                  <circle cx={record.wheel.x * 600} cy={record.wheel.y * 600} fill="#2563eb" r="4" />
                </g>
              ))}
              <rect fill="#22c55e" height="14" width="14" x={analysis.recommendedLayout.plate.x * 600 - 7} y={analysis.recommendedLayout.plate.y * 600 - 7} />
              <rect fill="#2563eb" height="14" width="14" x={analysis.recommendedLayout.wheel.x * 600 - 7} y={analysis.recommendedLayout.wheel.y * 600 - 7} />
            </svg>
            <p style={{ fontSize: 14 }}>Green: plate centers and target. Blue: wheel centers and target.</p>
          </section>

          <section aria-label="Recommended target layout" style={{ marginTop: 24 }}>
            <h2>Recommended Target Layout</h2>
            <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>{JSON.stringify(analysis.recommendedLayout, null, 2)}</pre>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={exportJson} type="button">Export JSON</button>
              <button onClick={copyJson} type="button">Copy JSON</button>
              {copyStatus !== undefined && <span>{copyStatus}</span>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
