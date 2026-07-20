import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  buildCalibrationObservationFromDetections,
  type CalibrationObservation,
} from '../calibration/CalibrationObservation';
import {
  exportCalibrationQualityReport,
  exportGeneratedTargetLayout,
  exportRawCalibrationObservations,
  exportTargetLayoutTypeScript,
} from '../calibration/CalibrationExport';
import { LocalStorageCalibrationRepository } from '../calibration/LocalStorageCalibrationRepository';
import { generateTargetLayout, type CalibrationGenerationResult } from '../calibration/TargetLayoutGenerator';
import { angleLabel, type CaptureAngle } from '../guide/TargetLayout';
import { getTargetLayout } from '../guide/TargetLayout';
import { VEHICLE_PROFILES, type VehicleId } from '../guide/VehicleProfiles';

const ANGLES: CaptureAngle[] = ['front-left', 'front-right', 'rear-left', 'rear-right'];
const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const RECOMMENDED_MINIMUM = 30;
const RECOMMENDED_MAXIMUM = 50;

interface FrameState {
  width: number;
  height: number;
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? '-' : value.toFixed(3);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? '-' : `${(value * 100).toFixed(1)} %`;
}

function downloadText(filename: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function observationSummary(observation: CalibrationObservation | undefined): React.JSX.Element {
  if (observation === undefined) {
    return <p>尚未取得可儲存的校正樣本。</p>;
  }

  return (
    <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content 1fr' }}>
      <dt>車牌中心</dt><dd>x={formatNumber(observation.plate.centerX)}, y={formatNumber(observation.plate.centerY)}</dd>
      <dt>輪胎中心</dt><dd>x={formatNumber(observation.wheel.centerX)}, y={formatNumber(observation.wheel.centerY)}</dd>
      <dt>車牌尺寸</dt><dd>w={formatNumber(observation.plate.width)}, h={formatNumber(observation.plate.height)}</dd>
      <dt>輪胎尺寸</dt><dd>w={formatNumber(observation.wheel.width)}, h={formatNumber(observation.wheel.height)}</dd>
      <dt>配對中點</dt><dd>x={formatNumber(observation.pair.midpointX)}, y={formatNumber(observation.pair.midpointY)}</dd>
      <dt>Pair dx</dt><dd>{formatNumber(observation.pair.dx)}</dd>
      <dt>Pair dy</dt><dd>{formatNumber(observation.pair.dy)}</dd>
      <dt>Pair distance</dt><dd>{formatNumber(observation.pair.distance)}</dd>
      <dt>Pair angle</dt><dd>{formatNumber(observation.pair.angleRadians)} rad</dd>
      <dt>輪胎候選數</dt><dd>{observation.wheelSelection.candidateCount}</dd>
      <dt>選中輪胎中心</dt><dd>{observation.wheelSelection.selectedCenter === undefined ? '-' : `x=${formatNumber(observation.wheelSelection.selectedCenter.x)}, y=${formatNumber(observation.wheelSelection.selectedCenter.y)}`}</dd>
    </dl>
  );
}

export default function CalibrationPage(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const repository = useMemo(() => new LocalStorageCalibrationRepository(), []);
  const sessionRef = useRef<ort.InferenceSession | undefined>(undefined);
  const [selectedProfileId, setSelectedProfileId] = useState<VehicleId>('yaris');
  const [customVehicleId, setCustomVehicleId] = useState('');
  const [customDisplayName, setCustomDisplayName] = useState('');
  const [captureAngle, setCaptureAngle] = useState<CaptureAngle>('rear-right');
  const [frame, setFrame] = useState<FrameState>({ width: 1, height: 1 });
  const [currentObservation, setCurrentObservation] = useState<CalibrationObservation>();
  const [observations, setObservations] = useState<CalibrationObservation[]>([]);
  const [generation, setGeneration] = useState<CalibrationGenerationResult>();
  const [rejectionReason, setRejectionReason] = useState('');
  const [status, setStatus] = useState<string>();
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');

  const selectedProfile = VEHICLE_PROFILES.find((profile) => profile.vehicleId === selectedProfileId) ?? VEHICLE_PROFILES[0];
  const vehicleId = customVehicleId.trim() === '' ? selectedProfile.vehicleId : customVehicleId.trim();
  const vehicleDisplayName = customDisplayName.trim() === '' ? selectedProfile.displayName : customDisplayName.trim();
  const baselineLayout = useMemo(() => getTargetLayout(selectedProfileId, captureAngle), [captureAngle, selectedProfileId]);
  const acceptedCount = observations.filter((observation) => observation.accepted).length;

  const refreshObservations = useCallback((): void => {
    setObservations(repository.list(vehicleId, captureAngle));
  }, [captureAngle, repository, vehicleId]);

  const evaluateDetections = useCallback((nextDetections: BoxDetection[], width: number, height: number, source: CalibrationObservation['source']): void => {
    setFrame({ width, height });

    try {
      const observation = buildCalibrationObservationFromDetections({
        id: crypto.randomUUID(),
        vehicleId,
        vehicleDisplayName,
        captureAngle,
        capturedAt: new Date().toISOString(),
        imageWidth: width,
        imageHeight: height,
        detections: nextDetections,
        targetWheel: { x: baselineLayout.wheel.x, y: baselineLayout.wheel.y },
        source,
        accepted: true,
        confidenceThreshold: CONFIDENCE_THRESHOLD,
      });
      setCurrentObservation(observation);
      setStatus(undefined);
    } catch (caught) {
      setCurrentObservation(undefined);
      setStatus(caught instanceof Error ? caught.message : '目前畫面無法建立校正樣本。');
    }
  }, [baselineLayout, captureAngle, vehicleDisplayName, vehicleId]);

  const runPipeline = useCallback(async (
    image: CanvasImageSource,
    width: number,
    height: number,
    source: CalibrationObservation['source'],
  ): Promise<void> => {
    const session = sessionRef.current;

    if (session === undefined) {
      return;
    }

    const letterboxed = letterbox(image, width, height);
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
      { width, height },
    );
    evaluateDetections(recovered, width, height, source);
  }, [evaluateDetections]);

  useEffect(() => {
    refreshObservations();
    setGeneration(undefined);
  }, [refreshObservations]);

  useEffect(() => {
    let active = true;
    let animationFrame: number | undefined;
    let stream: MediaStream | undefined;
    let inferenceInFlight = false;

    const loop = async (): Promise<void> => {
      const video = videoRef.current;

      if (
        active
        && video !== null
        && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && video.videoWidth > 0
        && !inferenceInFlight
      ) {
        inferenceInFlight = true;
        try {
          await runPipeline(video, video.videoWidth, video.videoHeight, 'live-camera');
        } catch (caught) {
          setStatus(caught instanceof Error ? caught.message : '校正推論失敗。');
        } finally {
          inferenceInFlight = false;
        }
      }

      if (active) {
        animationFrame = window.requestAnimationFrame(() => {
          void loop();
        });
      }
    };

    const start = async (): Promise<void> => {
      try {
        const modelPath = `${import.meta.env.BASE_URL}best.onnx`;
        sessionRef.current = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        setCameraFacingMode(stream.getVideoTracks()[0]?.getSettings().facingMode ?? 'environment');
        const video = videoRef.current;

        if (video === null) {
          return;
        }

        video.srcObject = stream;
        await video.play();
        animationFrame = window.requestAnimationFrame(() => {
          void loop();
        });
      } catch (caught) {
        setStatus(caught instanceof Error ? caught.message : '無法啟動校正相機。');
      }
    };

    void start();

    return () => {
      active = false;
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [runPipeline]);

  const saveCurrent = (accepted: boolean): void => {
    if (currentObservation === undefined) {
      setStatus('目前沒有可儲存的校正樣本。');
      return;
    }

    const observation = {
      ...currentObservation,
      id: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      accepted,
      rejectionReason: accepted ? undefined : rejectionReason.trim() || 'operator rejected',
    };
    repository.save(observation);
    refreshObservations();
    setStatus(accepted ? '已儲存校正樣本。' : '已排除此樣本。');
  };

  const generate = (): void => {
    try {
      const result = generateTargetLayout(observations);
      setGeneration(result);
      setStatus(undefined);
    } catch (caught) {
      setGeneration(undefined);
      setStatus(caught instanceof Error ? caught.message : '無法產生 TargetLayout。');
    }
  };

  const handleImageUpload = (file: File | undefined): void => {
    if (file === undefined) {
      return;
    }

    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      void runPipeline(image, image.naturalWidth, image.naturalHeight, 'uploaded-image')
        .finally(() => URL.revokeObjectURL(url));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus('無法讀取上傳圖片。');
    };
    image.src = url;
  };

  return (
    <main style={{ background: '#f8fafc', color: '#111827', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', padding: 20 }}>
      <header style={{ margin: '0 auto 16px', maxWidth: 1280 }}>
        <h1 style={{ margin: 0 }}>TargetLayout 校正模式</h1>
        <p style={{ color: '#475569', margin: '8px 0 0' }}>收集 30–50 筆已接受樣本後產生可貼入 VehicleProfiles 的 TargetLayout。</p>
      </header>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', margin: '0 auto 16px', maxWidth: 1280 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>選擇既有車型</span>
          <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value as VehicleId)}>
            {VEHICLE_PROFILES.map((profile) => <option key={profile.vehicleId} value={profile.vehicleId}>{profile.displayName}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>新車型 ID</span>
          <input onChange={(event) => setCustomVehicleId(event.target.value)} placeholder="例如 yaris" value={customVehicleId} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>車型中文名稱</span>
          <input onChange={(event) => setCustomDisplayName(event.target.value)} placeholder="例如 Toyota Yaris" value={customDisplayName} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>拍攝角度</span>
          <select value={captureAngle} onChange={(event) => setCaptureAngle(event.target.value as CaptureAngle)}>
            {ANGLES.map((angle) => <option key={angle} value={angle}>{angleLabel(angle)} ({angle})</option>)}
          </select>
        </label>
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.7fr)', margin: '0 auto', maxWidth: 1280 }}>
        <div>
          <video autoPlay muted playsInline ref={videoRef} style={{ background: '#020617', borderRadius: 8, display: 'block', width: '100%' }} />
          <p>相機 facing mode：{cameraFacingMode} · 影像尺寸：{frame.width} × {frame.height}</p>
          <input accept="image/jpeg,image/png" onChange={(event) => handleImageUpload(event.target.files?.[0])} type="file" />
        </div>

        <aside style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 14 }}>
          <h2 style={{ marginTop: 0 }}>目前樣本</h2>
          {observationSummary(currentObservation)}
          <p>車牌信心值：{formatPercent(currentObservation?.plate.confidence)}</p>
          <p>輪胎信心值：{formatPercent(currentObservation?.wheel.confidence)}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            <button onClick={() => saveCurrent(true)} type="button">儲存校正樣本</button>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>排除原因</span>
              <input onChange={(event) => setRejectionReason(event.target.value)} value={rejectionReason} />
            </label>
            <button onClick={() => saveCurrent(false)} type="button">排除此樣本</button>
            <button onClick={() => {
              if (currentObservation !== undefined) {
                void navigator.clipboard.writeText(JSON.stringify(currentObservation, null, 2));
              }
            }} type="button">複製目前樣本 JSON</button>
          </div>
          {status !== undefined && <p role="status">{status}</p>}
        </aside>
      </section>

      <section style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, margin: '16px auto 0', maxWidth: 1280, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>校正資料</h2>
        <p>車型：{vehicleDisplayName} · Vehicle ID：{vehicleId} · 拍攝角度：{angleLabel(captureAngle)} · 校正資料角度：{captureAngle}</p>
        <p>已收集 {acceptedCount} / {RECOMMENDED_MINIMUM} 筆最低建議樣本，建議範圍 {RECOMMENDED_MINIMUM}–{RECOMMENDED_MAXIMUM} 筆。</p>
        {acceptedCount < RECOMMENDED_MINIMUM && <p style={{ color: '#b45309' }}>樣本未達 30 筆，產生結果可能不穩定。</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => downloadText(`${vehicleId}-${captureAngle}-observations.json`, repository.export(vehicleId, captureAngle))} type="button">下載全部校正資料</button>
          <button onClick={() => {
            repository.clear(vehicleId, captureAngle);
            refreshObservations();
            setGeneration(undefined);
          }} type="button">清除目前校正資料</button>
          <button onClick={generate} type="button">產生 TargetLayout</button>
        </div>
      </section>

      {generation !== undefined && (
        <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', margin: '16px auto 0', maxWidth: 1280 }}>
          <article style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>校正品質</h2>
            <p>品質：{generation.quality.quality}</p>
            <p>樣本：{generation.quality.includedSampleCount} included / {generation.quality.sampleCount} accepted · outliers {generation.quality.outlierCount}</p>
            {generation.quality.warnings.map((warning) => <p key={warning} style={{ color: '#b45309' }}>{warning}</p>)}
          </article>
          <article style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>匯出</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              <button onClick={() => downloadText(`${vehicleId}-${captureAngle}-target-layout.json`, exportGeneratedTargetLayout(generation))} type="button">下載 TargetLayout JSON</button>
              <button onClick={() => downloadText(`${vehicleId}-${captureAngle}-target-layout.ts.txt`, exportTargetLayoutTypeScript(captureAngle, generation.layout), 'text/plain')} type="button">下載 TypeScript 物件</button>
              <button onClick={() => downloadText(`${vehicleId}-${captureAngle}-quality.json`, exportCalibrationQualityReport(generation))} type="button">下載品質報告 JSON</button>
              <button onClick={() => { void navigator.clipboard.writeText(exportTargetLayoutTypeScript(captureAngle, generation.layout)); }} type="button">複製 TypeScript</button>
            </div>
          </article>
          <article style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, gridColumn: '1 / -1', padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Generated TargetLayout JSON</h2>
            <pre style={{ background: '#f1f5f9', overflowX: 'auto', padding: 12 }}>{exportGeneratedTargetLayout(generation)}</pre>
          </article>
        </section>
      )}

      <section style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, margin: '16px auto 0', maxWidth: 1280, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>已儲存樣本</h2>
        <p>總數：{observations.length} · accepted：{acceptedCount}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {observations.slice(-12).reverse().map((observation) => (
            <div key={observation.id} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
              <strong>{observation.accepted ? '接受' : '排除'}</strong> · {observation.capturedAt} · plate x={formatNumber(observation.plate.centerX)}, wheel x={formatNumber(observation.wheel.centerX)}
              <button onClick={() => {
                repository.remove(observation.id);
                refreshObservations();
              }} style={{ marginLeft: 8 }} type="button">移除</button>
            </div>
          ))}
        </div>
      </section>

      <pre style={{ display: 'none' }}>{exportRawCalibrationObservations(observations)}</pre>
    </main>
  );
}
