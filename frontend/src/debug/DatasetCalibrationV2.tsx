import { useEffect, useRef, useState } from 'react';
import {
  createVehicleLayoutExport,
  recommendVehicleLayout,
  type DatasetLayoutRecommendation,
  type HeatmapCell,
  type PointStatistics,
} from '../calibration/DatasetLayoutAnalyzer';
import { processDataset, type DatasetRejectionCounts } from '../calibration/DatasetProcessor';
import type { CaptureAngle, TargetLayout } from '../guide/TargetLayout';
import { VEHICLE_PROFILES, type VehicleId } from '../guide/VehicleProfiles';

const ANGLES: CaptureAngle[] = ['front-left', 'front-right', 'rear-left', 'rear-right'];

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

function StatisticsTable({ title, statistics }: { title: string; statistics: PointStatistics }): React.JSX.Element {
  return (
    <section>
      <h3>{title}</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr><th style={{ textAlign: 'left' }}>Axis</th><th>Mean</th><th>Median</th><th>Std. Dev.</th><th>95% Range</th></tr>
        </thead>
        <tbody>
          <tr><td>x</td><td>{statistics.x.mean.toFixed(4)}</td><td>{statistics.x.median.toFixed(4)}</td><td>{statistics.x.standardDeviation.toFixed(4)}</td><td>{statistics.x.confidence95.lower.toFixed(4)}–{statistics.x.confidence95.upper.toFixed(4)}</td></tr>
          <tr><td>y</td><td>{statistics.y.mean.toFixed(4)}</td><td>{statistics.y.median.toFixed(4)}</td><td>{statistics.y.standardDeviation.toFixed(4)}</td><td>{statistics.y.confidence95.lower.toFixed(4)}–{statistics.y.confidence95.upper.toFixed(4)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}

function Heatmap({ cells, color }: { cells: HeatmapCell[]; color: string }): React.JSX.Element {
  const maximumCount = Math.max(1, ...cells.map((cell) => cell.count));

  return (
    <svg aria-label="Detection center heatmap" style={{ background: '#f3f4f6', border: '1px solid #9ca3af', maxWidth: '100%' }} viewBox="0 0 400 400">
      {Array.from({ length: 11 }, (_, index) => index * 40).map((position) => (
        <g key={position}>
          <line stroke="#d1d5db" x1={position} x2={position} y1="0" y2="400" />
          <line stroke="#d1d5db" x1="0" x2="400" y1={position} y2={position} />
        </g>
      ))}
      {cells.map((cell) => (
        <rect
          fill={color}
          fillOpacity={cell.count / maximumCount}
          height="40"
          key={`${cell.xIndex}-${cell.yIndex}`}
          width="40"
          x={cell.xIndex * 40}
          y={cell.yIndex * 40}
        />
      ))}
    </svg>
  );
}

function TargetSlider({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span>{label}: {value.toFixed(3)}</span>
      <input max={maximum} min={minimum} onChange={(event) => onChange(Number(event.target.value))} step="0.001" type="range" value={value} />
    </label>
  );
}

/**
 * Internal, review-only vehicle dataset calibrator. It owns its draft layout
 * state and exports JSON for review; it never writes to VehicleProfiles.
 */
export function DatasetCalibrationV2(): React.JSX.Element {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [vehicleId, setVehicleId] = useState<VehicleId>('corolla-cross');
  const [captureAngle, setCaptureAngle] = useState<CaptureAngle>('rear-right');
  const [files, setFiles] = useState<File[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25);
  const [qualityThreshold, setQualityThreshold] = useState(60);
  const [recommendation, setRecommendation] = useState<DatasetLayoutRecommendation>();
  const [draftLayout, setDraftLayout] = useState<TargetLayout>();
  const [rejections, setRejections] = useState<DatasetRejectionCounts>({
    plateMissing: 0,
    wheelMissing: 0,
    lowConfidence: 0,
    poorQuality: 0,
    unreadable: 0,
  });
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const [exportConfidenceEllipses, setExportConfidenceEllipses] = useState(false);

  useEffect(() => {
    const input = folderInputRef.current;
    input?.setAttribute('webkitdirectory', '');
    input?.setAttribute('directory', '');
  }, []);

  const analyzeFolder = (): void => {
    void (async () => {
      if (files.length === 0) {
        setError('Select a dataset folder before analysis.');
        return;
      }

      setError(undefined);
      setRecommendation(undefined);
      setDraftLayout(undefined);
      setCopyStatus(undefined);
      setAccepted(false);

      const result = await processDataset(
        files,
        { confidenceThreshold, qualityThreshold },
        ({ current, total, imageName }) => setProgress(`Processing ${current} / ${total}: ${imageName}`),
      );
      setRejections(result.rejections);
      setProgress(undefined);

      if (result.observations.length === 0) {
        setError('No dataset images passed detection confidence and quality checks.');
        return;
      }

      const nextRecommendation = recommendVehicleLayout(vehicleId, captureAngle, result.observations);
      setRecommendation(nextRecommendation);
      setDraftLayout(nextRecommendation.targetLayout);
    })().catch((caught) => {
      setProgress(undefined);
      setError(caught instanceof Error ? caught.message : 'Dataset calibration failed.');
    });
  };

  const acceptRecommendation = (): void => {
    if (recommendation === undefined) {
      return;
    }

    setDraftLayout({
      plate: { ...recommendation.targetLayout.plate },
      wheel: { ...recommendation.targetLayout.wheel },
    });
    setAccepted(true);
  };

  const updateDraft = (point: 'plate' | 'wheel', key: 'x' | 'y' | 'tolerance', value: number): void => {
    setDraftLayout((current) => current === undefined
      ? current
      : {
          ...current,
          [point]: { ...current[point], [key]: value },
        });
    setAccepted(false);
  };

  const exportJson = (): void => {
    if (draftLayout === undefined) {
      return;
    }

    const confidenceEllipses = exportConfidenceEllipses && recommendation !== undefined
      ? { plate: recommendation.plateConfidenceEllipse, wheel: recommendation.wheelConfidenceEllipse }
      : undefined;
    const payload = createVehicleLayoutExport(vehicleId, captureAngle, draftLayout, confidenceEllipses);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${vehicleId}-${captureAngle}-target-layout.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = (): void => {
    if (draftLayout === undefined) {
      return;
    }

    const confidenceEllipses = exportConfidenceEllipses && recommendation !== undefined
      ? { plate: recommendation.plateConfidenceEllipse, wheel: recommendation.wheelConfidenceEllipse }
      : undefined;
    void navigator.clipboard.writeText(JSON.stringify(createVehicleLayoutExport(vehicleId, captureAngle, draftLayout, confidenceEllipses), null, 2))
      .then(() => setCopyStatus('Review JSON copied.'))
      .catch(() => setCopyStatus('Could not copy review JSON.'));
  };

  const selectedProfile = VEHICLE_PROFILES.find((profile) => profile.vehicleId === vehicleId);
  const validImageCount = recommendation?.plateHeatmap.reduce((sum, cell) => sum + cell.count, 0) ?? 0;
  const rejectedImageCount = Object.values(rejections).reduce((sum, count) => sum + count, 0);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1500, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Vehicle Dataset Calibration V2</h1>
      <p>Generated layouts are review drafts only. Exported JSON must be reviewed before publication; this tool never modifies production vehicle profiles.</p>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Vehicle Profile</span>
          <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value as VehicleId)}>
            {VEHICLE_PROFILES.map((profile) => <option key={profile.vehicleId} value={profile.vehicleId}>{profile.displayName}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Capture Angle</span>
          <select value={captureAngle} onChange={(event) => setCaptureAngle(event.target.value as CaptureAngle)}>
            {ANGLES.map((angle) => <option key={angle} value={angle}>{formatAngle(angle)}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Dataset Folder</span>
          <input accept="image/jpeg,image/png" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} ref={folderInputRef} type="file" />
        </label>
      </section>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 16 }}>
        <TargetSlider label="Confidence Threshold" maximum={1} minimum={0.01} onChange={setConfidenceThreshold} value={confidenceThreshold} />
        <TargetSlider label="Quality Threshold" maximum={100} minimum={0} onChange={setQualityThreshold} value={qualityThreshold} />
        <label style={{ alignItems: 'center', display: 'flex', gap: 8 }}><input checked={exportConfidenceEllipses} onChange={(event) => setExportConfidenceEllipses(event.target.checked)} type="checkbox" />Export confidence ellipses</label>
      </section>
      <p>Selected profile aspect ratio: {selectedProfile?.aspectRatio ?? '—'} · Files: {files.length}</p>
      <button disabled={progress !== undefined} onClick={analyzeFolder} type="button">Analyze Dataset Folder</button>
      {progress !== undefined && <p aria-live="polite">{progress}</p>}
      {error !== undefined && <p role="alert">{error}</p>}

      {recommendation !== undefined && draftLayout !== undefined && (
        <>
          <section aria-label="Dataset outcome" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content', marginTop: 24 }}>
            <strong>Dataset Images</strong><span>{files.length}</span>
            <strong>Valid Images</strong><span>{validImageCount}</span>
            <strong>Rejected Images</strong><span>{rejectedImageCount}</span>
            <strong>Plate Missing</strong><span>{rejections.plateMissing}</span>
            <strong>Wheel Missing</strong><span>{rejections.wheelMissing}</span>
            <strong>Confidence Below Threshold</strong><span>{rejections.lowConfidence}</span>
            <strong>Poor Quality</strong><span>{rejections.poorQuality}</span>
          </section>

          <section style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', marginTop: 24 }}>
            <StatisticsTable statistics={recommendation.plateStatistics} title="Plate Position Statistics" />
            <StatisticsTable statistics={recommendation.wheelStatistics} title="Wheel Position Statistics" />
          </section>

          <section style={{ marginTop: 24 }}>
            <h2>Expected Vehicle Size</h2>
            <p>Width: {recommendation.expectedVehicleSize.width.toFixed(4)} · Height: {recommendation.expectedVehicleSize.height.toFixed(4)}</p>
          </section>

          <section style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', marginTop: 24 }}>
            <div>
              <h2>Scatter Plot</h2>
              <svg aria-label="Plate and wheel center scatter plot" style={{ background: '#f3f4f6', border: '1px solid #9ca3af', maxWidth: '100%' }} viewBox="0 0 600 600">
                {[0, 0.25, 0.5, 0.75, 1].map((position) => <g key={position}><line stroke="#d1d5db" x1={position * 600} x2={position * 600} y1="0" y2="600" /><line stroke="#d1d5db" x1="0" x2="600" y1={position * 600} y2={position * 600} /></g>)}
                {recommendation.observations.map((observation) => (
                  <g key={observation.imageName}>
                    <circle cx={observation.plate.x * 600} cy={observation.plate.y * 600} fill="#22c55e" fillOpacity="0.55" r="4" />
                    <circle cx={observation.wheel.x * 600} cy={observation.wheel.y * 600} fill="#2563eb" fillOpacity="0.55" r="4" />
                  </g>
                ))}
                <ellipse cx={recommendation.targetLayout.plate.x * 600} cy={recommendation.targetLayout.plate.y * 600} fill="none" rx={recommendation.plateConfidenceEllipse.majorAxis * 600} ry={recommendation.plateConfidenceEllipse.minorAxis * 600} stroke="#22c55e" strokeDasharray="8 6" strokeWidth="2" transform={`rotate(${recommendation.plateConfidenceEllipse.rotation * 180 / Math.PI} ${recommendation.targetLayout.plate.x * 600} ${recommendation.targetLayout.plate.y * 600})`} />
                <ellipse cx={recommendation.targetLayout.wheel.x * 600} cy={recommendation.targetLayout.wheel.y * 600} fill="none" rx={recommendation.wheelConfidenceEllipse.majorAxis * 600} ry={recommendation.wheelConfidenceEllipse.minorAxis * 600} stroke="#2563eb" strokeDasharray="8 6" strokeWidth="2" transform={`rotate(${recommendation.wheelConfidenceEllipse.rotation * 180 / Math.PI} ${recommendation.targetLayout.wheel.x * 600} ${recommendation.targetLayout.wheel.y * 600})`} />
                <circle cx={recommendation.plateStatistics.x.mean * 600} cy={recommendation.plateStatistics.y.mean * 600} fill="#22c55e" r="7" />
                <circle cx={recommendation.wheelStatistics.x.mean * 600} cy={recommendation.wheelStatistics.y.mean * 600} fill="#2563eb" r="7" />
                <rect fill="#22c55e" height="14" width="14" x={recommendation.targetLayout.plate.x * 600 - 7} y={recommendation.targetLayout.plate.y * 600 - 7} />
                <rect fill="#2563eb" height="14" width="14" x={recommendation.targetLayout.wheel.x * 600 - 7} y={recommendation.targetLayout.wheel.y * 600 - 7} />
              </svg>
              <p>Circles: average positions. Squares/dashed ellipses: recommended targets and 95% confidence regions.</p>
            </div>
            <div>
              <h2>Heatmap</h2>
              <h3>Plate</h3><Heatmap cells={recommendation.plateHeatmap} color="#22c55e" />
              <h3>Wheel</h3><Heatmap cells={recommendation.wheelHeatmap} color="#2563eb" />
            </div>
          </section>

          <section aria-label="Review draft" style={{ marginTop: 24 }}>
            <h2>Recommended Target / Review Draft</h2>
            <button onClick={acceptRecommendation} type="button">Accept Recommendation</button>
            <span style={{ marginLeft: 12 }}>{accepted ? 'Accepted for review' : 'Draft not yet accepted'}</span>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 16 }}>
              <fieldset><legend>Plate</legend><TargetSlider label="X" maximum={1} minimum={0} onChange={(value) => updateDraft('plate', 'x', value)} value={draftLayout.plate.x} /><TargetSlider label="Y" maximum={1} minimum={0} onChange={(value) => updateDraft('plate', 'y', value)} value={draftLayout.plate.y} /><TargetSlider label="Tolerance" maximum={0.3} minimum={0.01} onChange={(value) => updateDraft('plate', 'tolerance', value)} value={draftLayout.plate.tolerance ?? draftLayout.plate.toleranceX} /></fieldset>
              <fieldset><legend>Wheel</legend><TargetSlider label="X" maximum={1} minimum={0} onChange={(value) => updateDraft('wheel', 'x', value)} value={draftLayout.wheel.x} /><TargetSlider label="Y" maximum={1} minimum={0} onChange={(value) => updateDraft('wheel', 'y', value)} value={draftLayout.wheel.y} /><TargetSlider label="Tolerance" maximum={0.3} minimum={0.01} onChange={(value) => updateDraft('wheel', 'tolerance', value)} value={draftLayout.wheel.tolerance ?? draftLayout.wheel.toleranceX} /></fieldset>
            </div>
            <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>{JSON.stringify(createVehicleLayoutExport(vehicleId, captureAngle, draftLayout, exportConfidenceEllipses ? { plate: recommendation.plateConfidenceEllipse, wheel: recommendation.wheelConfidenceEllipse } : undefined), null, 2)}</pre>
            <div style={{ display: 'flex', gap: 12 }}><button onClick={exportJson} type="button">Export Vehicle Layout JSON</button><button onClick={copyJson} type="button">Copy JSON</button>{copyStatus !== undefined && <span>{copyStatus}</span>}</div>
          </section>
        </>
      )}
    </main>
  );
}
