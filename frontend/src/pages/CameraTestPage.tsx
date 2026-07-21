import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web';
import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import { recoverOriginalCoordinates } from '../ai/postprocess/CoordinateMapper';
import { decode, type RawDetection } from '../ai/postprocess/Decoder';
import { classWiseNMS } from '../ai/postprocess/NMS';
import { runDetector } from '../ai/detector/Detector';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';
import { AutoCaptureController, AutoCaptureState } from '../capture/AutoCaptureController';
import { uploadCapturedImage, type UploadCapturedImageInput } from '../capture/uploadCapturedImage';
import type { GuidanceState, PairGeometry } from '../guide/GuidanceEngine';
import { calculateGuidanceState } from '../guide/GuidanceEngine';
import type { CaptureAngle, TargetRegion } from '../guide/TargetLayout';
import { angleLabel, getTargetLayout, targetRegionToGuideRectangle } from '../guide/TargetLayout';
import { getVehicleProfile, type VehicleId } from '../guide/VehicleProfiles';
import {
  CAMERA_CAPTURE_ANGLES,
  CAMERA_FACING_MODE,
  CAMERA_PREVIEW_MIRRORED,
  YARIS_ANGLE_COORDINATE_REFERENCE,
  createCapturedImageUploadInput,
  resetAngleDependentCaptureState,
  validateSelectedAngleLayout,
} from './CameraAngleValidation';

const DEFAULT_VEHICLE_ID: VehicleId = 'yaris';
const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;

export interface CameraTestPageProps {
  mode?: 'engineering' | 'production';
  vehicleId?: VehicleId;
  captureAngle?: CaptureAngle;
  currentStep?: number;
  totalSteps?: number;
  onCaptureFinished?: (image?: string) => void;
}

interface CameraFrame {
  width: number;
  height: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

interface CapturedImage {
  previewUrl: string;
  uploadInput: UploadCapturedImageInput;
}

interface GuideRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TargetVisual {
  key: 'plate' | 'wheel';
  label: string;
  color: string;
  target: NormalizedPoint;
  current?: NormalizedPoint;
  delta: NormalizedPoint;
  error: number;
  alignmentPercent: number;
  insideTolerance: boolean;
  toleranceX: number;
  toleranceY: number;
  targetPixel: PixelPoint;
  currentPixel?: PixelPoint;
  rectangle: GuideRectangle;
  radius: number;
}

interface NormalizedSize {
  width: number;
  height: number;
}

interface VehicleSizeDebug {
  target: NormalizedSize;
  current?: NormalizedSize;
  differencePercent?: number;
}

type CaptureSource = 'automatic' | 'manual';
type DecoderCompatibleResult = ReturnType<typeof decode> | RawDetection[];

function classLabel(classId: number): string {
  if (classId === 0) {
    return '車牌';
  }

  if (classId === 1) {
    return '輪胎';
  }

  return `類別 ${classId}`;
}

function classColor(classId: number): string {
  if (classId === 0) {
    return '#22c55e';
  }

  if (classId === 1) {
    return '#38bdf8';
  }

  return '#f59e0b';
}

function scoreColor(score: number): string {
  if (score >= 90) {
    return '#22c55e';
  }

  if (score >= 70) {
    return '#f59e0b';
  }

  return '#ef4444';
}

function translateHint(hint: string): string {
  const hintMap: Record<string, string> = {
    'License plate not detected': '尚未偵測到車牌',
    'Wheel not detected': '尚未偵測到輪胎',
    'Move Left': '請將手機向左移動',
    'Move Right': '請將手機向右移動',
    'Move Up': '請將手機向上移動',
    'Move Down': '請將手機向下移動',
    'Move Closer': '請靠近車輛',
    'Move Farther': '請遠離車輛',
  };

  return hintMap[hint] ?? hint;
}

function autoCaptureStateLabel(state: AutoCaptureState): string {
  const stateMap: Record<AutoCaptureState, string> = {
    [AutoCaptureState.Idle]: '待命',
    [AutoCaptureState.Guiding]: '引導中',
    [AutoCaptureState.CountingDown]: '倒數計時',
    [AutoCaptureState.Capturing]: '拍攝中',
    [AutoCaptureState.Completed]: '已完成',
  };

  return stateMap[state];
}

function highestConfidence(detections: readonly BoxDetection[], classId: number): number | undefined {
  let confidence: number | undefined;

  for (const detection of detections) {
    if (detection.classId === classId && (confidence === undefined || detection.confidence > confidence)) {
      confidence = detection.confidence;
    }
  }

  return confidence;
}

function getDecodedDetections(decoded: DecoderCompatibleResult): RawDetection[] {
  if (Array.isArray(decoded)) {
    return decoded;
  }

  return decoded.detections;
}

function pointToPixel(point: NormalizedPoint, frame: CameraFrame): PixelPoint {
  return {
    x: point.x * frame.width,
    y: point.y * frame.height,
  };
}

function detectionCenter(detection: BoxDetection): PixelPoint {
  return {
    x: (detection.x1 + detection.x2) / 2,
    y: (detection.y1 + detection.y2) / 2,
  };
}

function createGuideRectangle(target: TargetRegion, frame: CameraFrame): GuideRectangle {
  return targetRegionToGuideRectangle(target, frame);
}

function createTargetVisual(
  key: TargetVisual['key'],
  label: string,
  color: string,
  target: TargetRegion,
  current: NormalizedPoint | undefined,
  frame: CameraFrame,
  insideTolerance: boolean,
  alignmentPercent: number,
): TargetVisual {
  const delta = current === undefined
    ? { x: 0, y: 0 }
    : { x: current.x - target.x, y: current.y - target.y };
  const error = current === undefined ? 1 : Math.hypot(delta.x, delta.y);

  return {
    key,
    label,
    color,
    target: { x: target.x, y: target.y },
    current,
    delta,
    error,
    alignmentPercent,
    insideTolerance,
    toleranceX: target.toleranceX,
    toleranceY: target.toleranceY,
    targetPixel: pointToPixel(target, frame),
    currentPixel: current === undefined ? undefined : pointToPixel(current, frame),
    rectangle: createGuideRectangle(target, frame),
    radius: Math.max(target.toleranceX * frame.width, target.toleranceY * frame.height),
  };
}

function currentSizeFromDetections(detections: readonly BoxDetection[], frame: CameraFrame): NormalizedSize | undefined {
  if (detections.length === 0 || frame.width === 0 || frame.height === 0) {
    return undefined;
  }

  const left = Math.min(...detections.map((detection) => detection.x1));
  const right = Math.max(...detections.map((detection) => detection.x2));
  const top = Math.min(...detections.map((detection) => detection.y1));
  const bottom = Math.max(...detections.map((detection) => detection.y2));

  return {
    width: Math.max(0, (right - left) / frame.width),
    height: Math.max(0, (bottom - top) / frame.height),
  };
}

function createVehicleSizeDebug(
  detections: readonly BoxDetection[],
  frame: CameraFrame,
  target: NormalizedSize,
): VehicleSizeDebug {
  const current = currentSizeFromDetections(detections, frame);
  const differencePercent = current === undefined || target.width === 0
    ? undefined
    : (current.width - target.width) / target.width * 100;

  return {
    target,
    current,
    differencePercent,
  };
}

function formatPoint(point: NormalizedPoint | undefined): string {
  if (point === undefined) {
    return '-';
  }

  return `x=${point.x.toFixed(3)}, y=${point.y.toFixed(3)}`;
}

function formatDelta(value: number): string {
  return value.toFixed(3);
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }

  return `${value.toFixed(1)} %`;
}

function formatSize(size: NormalizedSize | undefined): string {
  if (size === undefined) {
    return '-';
  }

  return `W ${(size.width * 100).toFixed(1)} % × H ${(size.height * 100).toFixed(1)} %`;
}

function formatAngleRadians(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }

  return `${value.toFixed(3)} rad`;
}

function formatPairMetric(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }

  return value.toFixed(3);
}

function formatPairGeometry(pair: PairGeometry | undefined): {
  plateCenter: string;
  wheelCenter: string;
  dx: string;
  dy: string;
  distance: string;
  angle: string;
} {
  if (pair === undefined) {
    return {
      plateCenter: '-',
      wheelCenter: '-',
      dx: '-',
      dy: '-',
      distance: '-',
      angle: '-',
    };
  }

  return {
    plateCenter: formatPoint(pair.plateCenter),
    wheelCenter: formatPoint(pair.wheelCenter),
    dx: formatDelta(pair.dx),
    dy: formatDelta(pair.dy),
    distance: formatPairMetric(pair.distance),
    angle: formatAngleRadians(pair.angleRadians),
  };
}

/**
 * The first real-vehicle testing page. React owns camera and presentation state
 * only; every image-processing and guidance operation is delegated to the
 * existing v2 pipeline modules.
 */
export default function CameraTestPage({
  mode = 'engineering',
  vehicleId = DEFAULT_VEHICLE_ID,
  captureAngle = 'rear-right',
  currentStep = 1,
  totalSteps = 4,
  onCaptureFinished,
}: CameraTestPageProps): React.JSX.Element {
  const productionMode = mode === 'production';
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const autoCaptureRef = useRef<AutoCaptureController | null>(null);
  const mountedRef = useRef(true);
  const reviewActiveRef = useRef(false);
  const captureInProgressRef = useRef(false);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const guidanceRef = useRef<GuidanceState | undefined>(undefined);
  const selectedAngleRef = useRef<CaptureAngle>(captureAngle);
  const targetLayoutRef = useRef(getTargetLayout(vehicleId, captureAngle));
  const layoutGuardRef = useRef(validateSelectedAngleLayout(captureAngle, targetLayoutRef.current));
  const [frame, setFrame] = useState<CameraFrame>({ width: 1, height: 1 });
  const [detections, setDetections] = useState<BoxDetection[]>([]);
  const [guidance, setGuidance] = useState<GuidanceState>();
  const [selectedCaptureAngle, setSelectedCaptureAngle] = useState<CaptureAngle>(captureAngle);
  const [fps, setFps] = useState(0);
  const [inferenceTime, setInferenceTime] = useState(0);
  const [autoCaptureState, setAutoCaptureState] = useState<AutoCaptureState>(AutoCaptureState.Idle);
  const [countdown, setCountdown] = useState<number>();
  const [capturedImage, setCapturedImage] = useState<CapturedImage>();
  const [cameraError, setCameraError] = useState<string>();
  const [cameraFacingMode, setCameraFacingMode] = useState(CAMERA_FACING_MODE);
  const [confirming, setConfirming] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string>();

  const profile = useMemo(() => getVehicleProfile(vehicleId), [vehicleId]);
  const targetLayout = useMemo(() => getTargetLayout(vehicleId, selectedCaptureAngle), [selectedCaptureAngle, vehicleId]);
  const layoutGuard = useMemo(
    () => validateSelectedAngleLayout(selectedCaptureAngle, targetLayout),
    [selectedCaptureAngle, targetLayout],
  );
  const targetVisuals = useMemo(
    () => [
      createTargetVisual(
        'plate',
        '車牌',
        '#22c55e',
        targetLayout.plate,
        guidance?.plateCurrent,
        frame,
        guidance?.componentReady.plate ?? false,
        guidance?.scores.plate ?? 0,
      ),
      createTargetVisual(
        'wheel',
        '輪胎',
        '#38bdf8',
        targetLayout.wheel,
        guidance?.wheelCurrent,
        frame,
        guidance?.componentReady.wheel ?? false,
        guidance?.scores.wheel ?? 0,
      ),
    ],
    [frame, guidance, targetLayout],
  );
  const vehicleSizeDebug = useMemo(
    () => createVehicleSizeDebug(detections, frame, targetLayout.expectedVehicleSize),
    [detections, frame, targetLayout],
  );

  useEffect(() => {
    if (productionMode) {
      setSelectedCaptureAngle(captureAngle);
    }
  }, [captureAngle, productionMode]);

  useEffect(() => {
    selectedAngleRef.current = selectedCaptureAngle;
    targetLayoutRef.current = targetLayout;
    layoutGuardRef.current = layoutGuard;
    guidanceRef.current = undefined;
    reviewActiveRef.current = false;

    if (previewUrlRef.current !== undefined) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = undefined;
    }

    setGuidance(undefined);
    setDetections([]);
    setCapturedImage(undefined);
    setCountdown(undefined);
    setConfirmationMessage(undefined);
    setConfirming(false);
    setAutoCaptureState(resetAngleDependentCaptureState(autoCaptureRef.current));
  }, [layoutGuard, selectedCaptureAngle, targetLayout]);

  const captureCurrentFrame = useCallback((source: CaptureSource = 'manual'): void => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const controller = autoCaptureRef.current;

    if (
      video === null
      || canvas === null
      || controller === null
      || video.videoWidth === 0
      || reviewActiveRef.current
      || captureInProgressRef.current
    ) {
      return;
    }

    if (source === 'manual') {
      controller.reset();
      setAutoCaptureState(controller.state);
      setCountdown(undefined);
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    if (context === null) {
      controller.reset();
      setAutoCaptureState(controller.state);
      return;
    }

    captureInProgressRef.current = true;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      captureInProgressRef.current = false;

      if (!mountedRef.current) {
        return;
      }

      if (blob === null) {
        controller.reset();
        setAutoCaptureState(controller.state);
        return;
      }

      if (previewUrlRef.current !== undefined) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      const capturedAt = new Date().toISOString();
      const currentGuidance = guidanceRef.current;
      const currentAngle = selectedAngleRef.current;
      const currentLayout = targetLayoutRef.current;
      const previewUrl = URL.createObjectURL(blob);
      const uploadInput: UploadCapturedImageInput = createCapturedImageUploadInput({
        blob,
        vehicleId,
        selectedAngle: currentAngle,
        captureSource: source,
        guidance: currentGuidance,
        targetLayout: currentLayout,
        capturedAt,
      });

      previewUrlRef.current = previewUrl;
      reviewActiveRef.current = true;
      setCapturedImage({ previewUrl, uploadInput });
      setConfirmationMessage(undefined);
      setCountdown(undefined);
      if (productionMode) {
        onCaptureFinished?.(previewUrl);
      }

      if (source === 'automatic') {
        controller.complete();
      }

      setAutoCaptureState(controller.state);
    }, 'image/png');
  }, [onCaptureFinished, productionMode, vehicleId]);

  const handleRetake = useCallback((): void => {
    const controller = autoCaptureRef.current;

    if (previewUrlRef.current !== undefined) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = undefined;
    }

    reviewActiveRef.current = false;
    setCapturedImage(undefined);
    setConfirmationMessage(undefined);
    setConfirming(false);
    setCountdown(undefined);

    if (controller !== null) {
      controller.reset();
      setAutoCaptureState(controller.state);
    }
  }, []);

  const handleConfirmPhoto = useCallback(async (): Promise<void> => {
    if (capturedImage === undefined || confirming) {
      return;
    }

    setConfirming(true);
    setConfirmationMessage(undefined);

    try {
      await uploadCapturedImage(capturedImage.uploadInput);
      setConfirmationMessage('照片已確認，等待上傳服務串接。');
    } catch (caught) {
      setConfirmationMessage(caught instanceof Error ? caught.message : '確認照片失敗。');
    } finally {
      if (mountedRef.current) {
        setConfirming(false);
      }
    }
  }, [capturedImage, confirming]);

  const updateVideoFrame = useCallback((): void => {
    const video = videoRef.current;

    if (video !== null && video.videoWidth > 0) {
      setFrame({ width: video.videoWidth, height: video.videoHeight });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AutoCaptureController({
      onCountdown: (remainingMilliseconds) => setCountdown(remainingMilliseconds),
      onCapture: () => captureCurrentFrame('automatic'),
      onCancel: () => setCountdown(undefined),
    });
    autoCaptureRef.current = controller;
    setAutoCaptureState(controller.state);

    return () => {
      mountedRef.current = false;
      autoCaptureRef.current = null;

      if (previewUrlRef.current !== undefined) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = undefined;
      }
    };
  }, [captureCurrentFrame]);

  useEffect(() => {
    let active = true;
    let animationFrame: number | undefined;
    let stream: MediaStream | undefined;
    let inferenceInFlight = false;
    let lastCompletedFrameAt: number | undefined;

    const scheduleNextFrame = (session: ort.InferenceSession): void => {
      if (active) {
        animationFrame = window.requestAnimationFrame(() => {
          void processFrame(session);
        });
      }
    };

    const processFrame = async (session: ort.InferenceSession): Promise<void> => {
      const video = videoRef.current;
      const controller = autoCaptureRef.current;

      if (
        !active
        || video === null
        || controller === null
        || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        || video.videoWidth === 0
        || inferenceInFlight
      ) {
        scheduleNextFrame(session);
        return;
      }

      inferenceInFlight = true;

      try {
        // This order deliberately mirrors the browser inference pipeline.
        const letterboxed = letterbox(video, video.videoWidth, video.videoHeight);
        const input = preprocess(letterboxed);
        const modelStartedAt = performance.now();
        const output = await runDetector(session, input);
        const modelInferenceTime = performance.now() - modelStartedAt;
        const decoded = decode(output) as DecoderCompatibleResult;
        const confidenceFiltered = filterByConfidence(getDecodedDetections(decoded), CONFIDENCE_THRESHOLD);
        const converted = convertXYWHToXYXY(confidenceFiltered);
        const nmsDetections = classWiseNMS(converted, IOU_THRESHOLD);
        const recovered = recoverOriginalCoordinates(
          nmsDetections,
          letterboxed.scale,
          letterboxed.padX,
          letterboxed.padY,
          { width: video.videoWidth, height: video.videoHeight },
        );
        const currentAngle = selectedAngleRef.current;
        const currentLayoutGuard = layoutGuardRef.current;
        const nextGuidance = calculateGuidanceState(
          recovered,
          video.videoWidth,
          video.videoHeight,
          vehicleId,
          currentAngle,
        );
        guidanceRef.current = nextGuidance;
        const nextAutoCaptureState = reviewActiveRef.current
          || captureInProgressRef.current
          || !currentLayoutGuard.valid
          ? controller.state
          : controller.update(nextGuidance);

        if (!currentLayoutGuard.valid && controller.state !== AutoCaptureState.Idle) {
          controller.reset();
        }

        const completedAt = performance.now();
        const nextFps = lastCompletedFrameAt === undefined
          ? 0
          : 1000 / Math.max(1, completedAt - lastCompletedFrameAt);
        lastCompletedFrameAt = completedAt;

        if (active && mountedRef.current) {
          setFrame({ width: video.videoWidth, height: video.videoHeight });
          setDetections(recovered);
          setGuidance(nextGuidance);
          setInferenceTime(modelInferenceTime);
          setFps(nextFps);
          if (!currentLayoutGuard.valid) {
            setCountdown(undefined);
          }
          setAutoCaptureState(currentLayoutGuard.valid ? nextAutoCaptureState : controller.state);
        }
      } catch (caught) {
        if (active && mountedRef.current) {
          setCameraError(caught instanceof Error ? caught.message : '相機推論失敗。');
        }
      } finally {
        inferenceInFlight = false;
        scheduleNextFrame(session);
      }
    };

    const startCamera = async (): Promise<void> => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('此瀏覽器不支援相機存取。');
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        stream = mediaStream;
        setCameraFacingMode(mediaStream.getVideoTracks()[0]?.getSettings().facingMode ?? CAMERA_FACING_MODE);
        const modelPath = `${import.meta.env.BASE_URL}best.onnx`;
        const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });

        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;

        if (video === null) {
          return;
        }

        video.srcObject = mediaStream;
        await video.play();
        updateVideoFrame();
        scheduleNextFrame(session);
      } catch (caught) {
        stream?.getTracks().forEach((track) => track.stop());
        stream = undefined;
        if (active && mountedRef.current) {
          setCameraError(caught instanceof Error ? caught.message : '無法啟動相機。');
        }
      }
    };

    void startCamera();

    return () => {
      active = false;
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }

      stream?.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (video !== null) {
        video.srcObject = null;
      }
    };
  }, [updateVideoFrame, vehicleId]);

  const plateConfidence = highestConfidence(detections, 0);
  const wheelConfidence = highestConfidence(detections, 1);
  const countdownSeconds = countdown === undefined ? undefined : Math.ceil(countdown / 1000);
  const score = guidance?.overallScore ?? 0;
  const plateVisual = targetVisuals[0];
  const wheelVisual = targetVisuals[1];
  const targetPairDebug = formatPairGeometry(guidance?.targetPair);
  const currentPairDebug = formatPairGeometry(guidance?.currentPair);
  const pairLineReady = guidance?.componentReady.scale === true && guidance.componentReady.angle;
  const targetPairLineColor = pairLineReady ? '#22c55e' : '#ffffff';
  const detectedPairLineColor = pairLineReady ? '#22c55e' : '#fbbf24';
  const guidanceMessages = guidance === undefined
    ? ['正在啟動相機']
    : guidance.hints.length === 0
      ? [guidance.ready ? '已對準' : '請保持手機穩定']
      : guidance.hints.map(translateHint);
  const selectedAngleLabel = angleLabel(selectedCaptureAngle);
  const layoutCalibrationSource = targetLayout.metadata?.calibrationSource ?? '-';

  return (
    <main style={{ background: '#0b1120', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', padding: 16 }}>
      {!productionMode && (
        <>
          <header style={{ margin: '0 auto 14px', maxWidth: 1100 }}>
            <p style={{ color: '#93c5fd', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>自動拍攝</p>
            <h1 style={{ fontSize: 30, lineHeight: 1.1, margin: 0 }}>AI 驗車拍攝</h1>
            <p style={{ color: '#cbd5e1', margin: '8px 0 0' }}>
              請依畫面引導完成拍攝
            </p>
          </header>

          <section aria-label="目前拍攝角度" style={{ alignItems: 'center', background: 'rgba(15, 23, 42, 0.88)', border: '1px solid #334155', borderRadius: 8, display: 'flex', gap: 12, justifyContent: 'space-between', margin: '0 auto 10px', maxWidth: 1100, padding: '10px 12px' }}>
            <div>
              <div style={{ color: '#bfdbfe', fontSize: 15, fontWeight: 900 }}>{profile.displayName}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700, marginTop: 2 }}>目前拍攝角度</div>
            </div>
            <strong style={{ color: '#f8fafc', fontSize: 24, lineHeight: 1 }}>{selectedAngleLabel}</strong>
          </section>
        </>
      )}

      {productionMode && (
        <header style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', margin: '0 auto 10px', maxWidth: 1100 }}>
          <strong style={{ color: '#f8fafc', fontSize: 28, lineHeight: 1 }}>
            {selectedAngleLabel}
          </strong>
          <span style={{ color: '#cbd5e1', fontSize: 16, fontWeight: 800 }}>
            第 {currentStep} / {totalSteps} 張
          </span>
        </header>
      )}

      {cameraError !== undefined && (
        <p role="alert" style={{ background: 'rgba(127, 29, 29, 0.72)', border: '1px solid #fca5a5', borderRadius: 6, color: '#fee2e2', margin: '0 auto 14px', maxWidth: 1100, padding: '10px 12px' }}>
          {cameraError}
        </p>
      )}

      <section style={{ margin: '0 auto', maxWidth: 1100, position: 'relative' }}>
        <video
          autoPlay
          muted
          onLoadedMetadata={updateVideoFrame}
          playsInline
          ref={videoRef}
          style={{ background: '#000', borderRadius: 8, display: 'block', height: 'auto', transform: CAMERA_PREVIEW_MIRRORED ? 'scaleX(-1)' : 'none', width: '100%' }}
        />

        <svg
          aria-label="引導區域"
          preserveAspectRatio="none"
          style={{ height: '100%', inset: 0, pointerEvents: 'none', position: 'absolute', width: '100%' }}
          viewBox={`0 0 ${frame.width} ${frame.height}`}
        >
          {!productionMode && (
            <line
              stroke={targetPairLineColor}
              strokeDasharray="12 10"
              strokeLinecap="round"
              strokeOpacity="0.72"
              strokeWidth="3"
              x1={plateVisual.targetPixel.x}
              x2={wheelVisual.targetPixel.x}
              y1={plateVisual.targetPixel.y}
              y2={wheelVisual.targetPixel.y}
            />
          )}
          {targetVisuals.map((target) => {
            const activeColor = target.insideTolerance ? '#22c55e' : '#ffffff';
            const centerLabelY = Math.max(24, target.rectangle.y - 10);

            return (
              <g key={target.key}>
                {!productionMode && (
                  <circle
                    cx={target.targetPixel.x}
                    cy={target.targetPixel.y}
                    fill="rgba(255, 255, 255, 0.04)"
                    r={target.radius}
                    stroke={activeColor}
                    strokeDasharray="8 8"
                    strokeOpacity="0.78"
                    strokeWidth="2"
                  />
                )}
                <rect
                  fill={productionMode ? 'transparent' : target.insideTolerance ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.06)'}
                  height={target.rectangle.height}
                  rx="4"
                  stroke={activeColor}
                  strokeDasharray={productionMode ? undefined : '14 10'}
                  strokeWidth="5"
                  width={target.rectangle.width}
                  x={target.rectangle.x}
                  y={target.rectangle.y}
                />
                {!productionMode && (
                  <circle
                    cx={target.targetPixel.x}
                    cy={target.targetPixel.y}
                    fill="rgba(15, 23, 42, 0.35)"
                    r="12"
                    stroke="#ffffff"
                    strokeWidth="4"
                  />
                )}
                <text
                  fill={activeColor}
                  fontSize="18"
                  fontWeight="900"
                  stroke="#0f172a"
                  strokeWidth="4"
                  style={{ paintOrder: 'stroke' }}
                  x={target.rectangle.x + 8}
                  y={centerLabelY}
                >
                  {productionMode ? target.label : `${target.label}目標區`}
                </text>
              </g>
            );
          })}
        </svg>

        {!productionMode && (
          <svg
            aria-label="對準偏移"
            preserveAspectRatio="none"
            style={{ height: '100%', inset: 0, pointerEvents: 'none', position: 'absolute', width: '100%' }}
            viewBox={`0 0 ${frame.width} ${frame.height}`}
          >
            {targetVisuals.map((target) => {
              if (target.currentPixel === undefined) {
                return null;
              }

              const color = target.insideTolerance ? '#22c55e' : '#ffffff';

              return (
                <g key={target.key}>
                  <line
                    stroke={color}
                    strokeLinecap="round"
                    strokeOpacity="0.92"
                    strokeWidth="2"
                    x1={target.targetPixel.x}
                    x2={target.currentPixel.x}
                    y1={target.targetPixel.y}
                    y2={target.currentPixel.y}
                  />
                  <circle cx={target.currentPixel.x} cy={target.currentPixel.y} fill={target.color} r="8" stroke="#0f172a" strokeWidth="3" />
                </g>
              );
            })}
          </svg>
        )}

        {!productionMode && (
          <svg
            aria-label="AI 偵測框"
            preserveAspectRatio="none"
            style={{ height: '100%', inset: 0, pointerEvents: 'none', position: 'absolute', width: '100%' }}
            viewBox={`0 0 ${frame.width} ${frame.height}`}
          >
          {plateVisual.currentPixel !== undefined && wheelVisual.currentPixel !== undefined && (
            <line
              stroke={detectedPairLineColor}
              strokeLinecap="round"
              strokeOpacity="0.9"
              strokeWidth="3"
              x1={plateVisual.currentPixel.x}
              x2={wheelVisual.currentPixel.x}
              y1={plateVisual.currentPixel.y}
              y2={wheelVisual.currentPixel.y}
            />
          )}
          {detections.map((detection, index) => {
            const color = classColor(detection.classId);
            const label = `${classLabel(detection.classId)} ${(detection.confidence * 100).toFixed(0)}%`;
            const labelY = Math.max(22, detection.y1 - 8);
            const center = detectionCenter(detection);

            return (
              <g key={`${detection.classId}-${index}-${detection.x1}-${detection.y1}`}>
                <rect fill="none" height={Math.max(0, detection.y2 - detection.y1)} stroke={color} strokeWidth="3" width={Math.max(0, detection.x2 - detection.x1)} x={detection.x1} y={detection.y1} />
                <circle cx={center.x} cy={center.y} fill={color} r="6" stroke="#0f172a" strokeWidth="3" />
                <rect fill={color} height="24" rx="4" width={Math.max(84, label.length * 13)} x={detection.x1} y={labelY - 20} />
                <text fill="#0f172a" fontSize="15" fontWeight="800" x={detection.x1 + 6} y={labelY - 4}>{label}</text>
              </g>
            );
          })}
          </svg>
        )}

        <aside style={{ background: 'rgba(15, 23, 42, 0.88)', borderLeft: `5px solid ${guidance?.ready ? '#22c55e' : '#f59e0b'}`, borderRadius: 8, bottom: 16, left: 16, maxWidth: '78%', padding: '12px 14px', position: 'absolute' }}>
          <strong style={{ color: guidance?.ready ? '#86efac' : '#fde68a', display: 'block', fontSize: 18, marginBottom: 4 }}>
            {guidance?.ready ? '已對準' : '尚未對準'}
          </strong>
          {guidanceMessages.map((message) => <div key={message}>{message}</div>)}
        </aside>

        {autoCaptureState === AutoCaptureState.CountingDown && countdownSeconds !== undefined && (
          <div style={{ alignItems: 'center', background: 'rgba(34, 197, 94, 0.9)', border: '3px solid #dcfce7', borderRadius: '50%', boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)', display: 'flex', flexDirection: 'column', fontWeight: 800, height: 112, justifyContent: 'center', position: 'absolute', right: 18, top: 18, width: 112 }}>
            <span style={{ fontSize: 14 }}>倒數計時</span>
            <span style={{ fontSize: 44, lineHeight: 1 }}>{countdownSeconds}</span>
          </div>
        )}

        {!productionMode && capturedImage !== undefined && (
          <div style={{ alignItems: 'center', background: 'rgba(2, 6, 23, 0.92)', borderRadius: 8, display: 'flex', inset: 0, justifyContent: 'center', padding: 18, position: 'absolute' }}>
            <section style={{ maxWidth: 720, width: '100%' }}>
              <h2 style={{ fontSize: 24, margin: '0 0 12px' }}>拍攝結果</h2>
              <img alt="拍攝結果" src={capturedImage.previewUrl} style={{ border: '2px solid #22c55e', borderRadius: 8, display: 'block', height: 'auto', maxHeight: '62vh', objectFit: 'contain', width: '100%' }} />
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14 }}>
                <button onClick={handleRetake} style={{ background: '#334155', border: 0, borderRadius: 8, color: '#f8fafc', cursor: 'pointer', fontSize: 18, fontWeight: 800, padding: '14px 22px' }} type="button">
                  重新拍攝
                </button>
                <button disabled={confirming} onClick={() => { void handleConfirmPhoto(); }} style={{ background: confirming ? '#64748b' : '#22c55e', border: 0, borderRadius: 8, color: '#052e16', cursor: confirming ? 'wait' : 'pointer', fontSize: 18, fontWeight: 900, padding: '14px 22px' }} type="button">
                  {confirming ? '確認中' : '確認照片'}
                </button>
              </div>
              {confirmationMessage !== undefined && <p style={{ color: '#bbf7d0', margin: '12px 0 0', textAlign: 'center' }}>{confirmationMessage}</p>}
            </section>
          </div>
        )}
      </section>

      {!productionMode && (
        <section aria-label="拍攝角度選擇" style={{ margin: '14px auto 0', maxWidth: 1100 }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {CAMERA_CAPTURE_ANGLES.map((angle) => {
              const selected = angle === selectedCaptureAngle;

              return (
                <button
                  aria-label={`選擇${angleLabel(angle)}拍攝角度`}
                  aria-pressed={selected}
                  key={angle}
                  onClick={() => setSelectedCaptureAngle(angle)}
                  style={{
                    background: selected ? '#2563eb' : 'rgba(15, 23, 42, 0.72)',
                    border: selected ? '1px solid #60a5fa' : '1px solid #475569',
                    borderRadius: 8,
                    boxShadow: selected ? '0 10px 24px rgba(37, 99, 235, 0.28)' : 'none',
                    color: selected ? '#ffffff' : '#e2e8f0',
                    cursor: 'pointer',
                    fontSize: 17,
                    fontWeight: 900,
                    minHeight: 52,
                    padding: '12px 10px',
                    width: '100%',
                  }}
                  type="button"
                >
                  {angleLabel(angle)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {capturedImage === undefined && (
        <section style={{ alignItems: 'center', display: 'flex', flexDirection: 'column', gap: 12, margin: '18px auto 8px', maxWidth: 1100 }}>
          <button
            aria-label="手動拍攝"
            onClick={() => captureCurrentFrame('manual')}
            style={{ alignItems: 'center', background: '#f8fafc', border: '7px solid #94a3b8', borderRadius: '50%', boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)', color: '#0f172a', cursor: 'pointer', display: 'flex', fontSize: 18, fontWeight: 900, height: 92, justifyContent: 'center', width: 92 }}
            type="button"
          >
            拍攝
          </button>
          <div style={{ color: guidance?.ready ? '#86efac' : '#cbd5e1', fontWeight: 800 }}>
            {guidance?.ready ? '已對準，可自動拍攝' : '請依提示移動手機'}
          </div>
        </section>
      )}

      {!productionMode && (
      <details style={{ background: 'rgba(15, 23, 42, 0.78)', border: layoutGuard.valid ? '1px solid #334155' : '2px solid #f87171', borderRadius: 8, margin: '18px auto 0', maxWidth: 1100, padding: '12px 14px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800 }}>拍攝資訊</summary>
        <section aria-label="拍攝資訊內容" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 14 }}>
          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>目前拍攝</h2>
            <div><strong>目前驗證</strong><br />{profile.displayName}・{selectedAngleLabel}</div>
            <div style={{ marginTop: 8 }}><strong>拍攝站位</strong><br />請站在車輛本身的{selectedAngleLabel}拍攝</div>
            <div style={{ marginTop: 8 }}><strong>Vehicle</strong><br />{profile.displayName}</div>
            <div style={{ marginTop: 8 }}><strong>Vehicle ID</strong><br />{vehicleId}</div>
            <div style={{ marginTop: 8 }}><strong>Capture Angle</strong><br />{selectedAngleLabel}</div>
            <div style={{ marginTop: 8 }}><strong>Angle ID</strong><br />{selectedCaptureAngle}</div>
            <div style={{ marginTop: 8 }}><strong>Layout Key</strong><br />{vehicleId}/{selectedCaptureAngle}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>TargetLayout</h2>
            <div><strong>目標車牌中心</strong><br />{formatPoint(targetLayout.plate)}</div>
            <div style={{ marginTop: 8 }}><strong>目標輪胎中心</strong><br />{formatPoint(targetLayout.wheel)}</div>
            <div style={{ marginTop: 8 }}><strong>Expected Vehicle Size</strong><br />{formatSize(targetLayout.expectedVehicleSize)}</div>
            <div style={{ marginTop: 8 }}><strong>Layout Source</strong><br />{layoutCalibrationSource}</div>
            <div style={{ marginTop: 8 }}><strong>Layout Version</strong><br />-</div>
            <div style={{ marginTop: 8 }}><strong>Calibration Source</strong><br />{layoutCalibrationSource}</div>
            <div style={{ marginTop: 8 }}><strong>是否為 legacy layout</strong><br />{targetLayout.isLegacy ? '是' : '否'}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Metadata</h2>
            <div><strong>metadata.vehicleId</strong><br />{targetLayout.metadata?.vehicleId ?? '-'}</div>
            <div style={{ marginTop: 8 }}><strong>metadata.captureAngle</strong><br />{targetLayout.metadata?.captureAngle ?? '-'}</div>
            <div style={{ marginTop: 8 }}><strong>metadata.schemaVersion</strong><br />{targetLayout.metadata?.schemaVersion ?? '-'}</div>
            <div style={{ marginTop: 8 }}><strong>metadata.calibrationSampleCount</strong><br />{targetLayout.metadata?.calibrationSampleCount ?? '-'}</div>
            <div style={{ marginTop: 8 }}><strong>metadata.generatedAt</strong><br />{targetLayout.metadata?.generatedAt ?? '-'}</div>
            <div style={{ marginTop: 8 }}><strong>相機 facing mode</strong><br />{cameraFacingMode}</div>
            <div style={{ marginTop: 8 }}><strong>是否鏡像</strong><br />{CAMERA_PREVIEW_MIRRORED ? '是' : '否'}</div>
            <div style={{ color: layoutGuard.valid ? '#86efac' : '#fecaca', marginTop: 8 }}><strong>角度一致性</strong><br />{layoutGuard.valid ? '通過' : layoutGuard.error}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, gridColumn: '1 / -1', overflowX: 'auto', padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Yaris 四角度量測座標參考</h2>
            <table style={{ borderCollapse: 'collapse', minWidth: 620, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #475569', padding: '6px 8px', textAlign: 'left' }}>角度</th>
                  <th style={{ borderBottom: '1px solid #475569', padding: '6px 8px', textAlign: 'left' }}>Angle ID</th>
                  <th style={{ borderBottom: '1px solid #475569', padding: '6px 8px', textAlign: 'left' }}>車牌</th>
                  <th style={{ borderBottom: '1px solid #475569', padding: '6px 8px', textAlign: 'left' }}>輪胎</th>
                </tr>
              </thead>
              <tbody>
                {CAMERA_CAPTURE_ANGLES.map((angle) => {
                  const reference = YARIS_ANGLE_COORDINATE_REFERENCE[angle];

                  return (
                    <tr key={angle} style={{ color: angle === selectedCaptureAngle ? '#bfdbfe' : '#e2e8f0', fontWeight: angle === selectedCaptureAngle ? 900 : 500 }}>
                      <td style={{ borderBottom: '1px solid #1e293b', padding: '6px 8px' }}>{angleLabel(angle)}</td>
                      <td style={{ borderBottom: '1px solid #1e293b', padding: '6px 8px' }}>{angle}</td>
                      <td style={{ borderBottom: '1px solid #1e293b', padding: '6px 8px' }}>({reference.plate.x.toFixed(3)}, {reference.plate.y.toFixed(3)})</td>
                      <td style={{ borderBottom: '1px solid #1e293b', padding: '6px 8px' }}>({reference.wheel.x.toFixed(3)}, {reference.wheel.y.toFixed(3)})</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>
              此表僅供開發驗證；實際引導仍由 getTargetLayout() 載入的 TargetLayout 驅動。
            </p>
          </article>
        </section>
      </details>
      )}

      {!productionMode && (
      <details style={{ background: 'rgba(15, 23, 42, 0.78)', border: '1px solid #334155', borderRadius: 8, margin: '18px auto 0', maxWidth: 1100, padding: '12px 14px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800 }}>偵錯資訊</summary>
        <section aria-label="校準偵錯資訊" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 14 }}>
          {targetVisuals.map((target) => (
            <article key={target.key} style={{ background: 'rgba(2, 6, 23, 0.55)', border: `1px solid ${target.insideTolerance ? '#22c55e' : '#334155'}`, borderRadius: 8, padding: 12 }}>
              <h2 style={{ color: target.color, fontSize: 18, margin: '0 0 10px' }}>{target.label}</h2>
              <div><strong>目標中心</strong><br />{formatPoint(target.target)}</div>
              <div style={{ marginTop: 8 }}><strong>目前中心</strong><br />{formatPoint(target.current)}</div>
              <div style={{ marginTop: 8 }}><strong>偏移量</strong><br />{target.current === undefined ? '-' : target.error.toFixed(3)}</div>
              <div style={{ marginTop: 8 }}><strong>ΔX</strong><br />{target.current === undefined ? '-' : formatDelta(target.delta.x)}</div>
              <div style={{ marginTop: 8 }}><strong>ΔY</strong><br />{target.current === undefined ? '-' : formatDelta(target.delta.y)}</div>
              <div style={{ marginTop: 8 }}><strong>對準率</strong><br />{target.current === undefined ? '-' : `${target.alignmentPercent} %`}</div>
            </article>
          ))}

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>目標配對</h2>
            <div><strong>Plate Center</strong><br />{targetPairDebug.plateCenter}</div>
            <div style={{ marginTop: 8 }}><strong>Wheel Center</strong><br />{targetPairDebug.wheelCenter}</div>
            <div style={{ marginTop: 8 }}><strong>dx</strong><br />{targetPairDebug.dx}</div>
            <div style={{ marginTop: 8 }}><strong>dy</strong><br />{targetPairDebug.dy}</div>
            <div style={{ marginTop: 8 }}><strong>distance</strong><br />{targetPairDebug.distance}</div>
            <div style={{ marginTop: 8 }}><strong>angle</strong><br />{targetPairDebug.angle}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>目前配對</h2>
            <div><strong>Plate Center</strong><br />{currentPairDebug.plateCenter}</div>
            <div style={{ marginTop: 8 }}><strong>Wheel Center</strong><br />{currentPairDebug.wheelCenter}</div>
            <div style={{ marginTop: 8 }}><strong>dx</strong><br />{currentPairDebug.dx}</div>
            <div style={{ marginTop: 8 }}><strong>dy</strong><br />{currentPairDebug.dy}</div>
            <div style={{ marginTop: 8 }}><strong>distance</strong><br />{currentPairDebug.distance}</div>
            <div style={{ marginTop: 8 }}><strong>angle</strong><br />{currentPairDebug.angle}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>誤差</h2>
            <div><strong>midpoint dx</strong><br />{formatDelta(guidance?.errors.midpointDx ?? 0)}</div>
            <div style={{ marginTop: 8 }}><strong>midpoint dy</strong><br />{formatDelta(guidance?.errors.midpointDy ?? 0)}</div>
            <div style={{ marginTop: 8 }}><strong>distance error</strong><br />{formatPairMetric(guidance?.errors.distanceError)}</div>
            <div style={{ marginTop: 8 }}><strong>angle error</strong><br />{formatAngleRadians(guidance?.errors.angleError)}</div>
            <div style={{ marginTop: 8 }}><strong>plate dx</strong><br />{formatDelta(guidance?.errors.plateDx ?? 0)}</div>
            <div style={{ marginTop: 8 }}><strong>plate dy</strong><br />{formatDelta(guidance?.errors.plateDy ?? 0)}</div>
            <div style={{ marginTop: 8 }}><strong>wheel dx</strong><br />{formatDelta(guidance?.errors.wheelDx ?? 0)}</div>
            <div style={{ marginTop: 8 }}><strong>wheel dy</strong><br />{formatDelta(guidance?.errors.wheelDy ?? 0)}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>輪胎選擇</h2>
            <div><strong>候選數</strong><br />{guidance?.wheelSelection.candidateCount ?? 0}</div>
            <div style={{ marginTop: 8 }}><strong>選擇策略</strong><br />{guidance?.wheelSelection.strategy ?? '-'}</div>
            <div style={{ marginTop: 8 }}><strong>選中信心值</strong><br />{guidance?.wheelSelection.selectedConfidence === undefined ? '-' : `${(guidance.wheelSelection.selectedConfidence * 100).toFixed(1)} %`}</div>
            <div style={{ marginTop: 8 }}><strong>選中中心</strong><br />{formatPoint(guidance?.wheelSelection.selectedCenter)}</div>
            <div style={{ marginTop: 8 }}><strong>距離目標</strong><br />{formatPairMetric(guidance?.wheelSelection.distanceFromTarget)}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>分數</h2>
            <div><strong>translation alignment</strong><br />{guidance?.scores.translation ?? 0} %</div>
            <div style={{ marginTop: 8 }}><strong>scale alignment</strong><br />{guidance?.scores.scale ?? 0} %</div>
            <div style={{ marginTop: 8 }}><strong>angle alignment</strong><br />{guidance?.scores.angle ?? 0} %</div>
            <div style={{ marginTop: 8 }}><strong>plate alignment</strong><br />{guidance?.scores.plate ?? 0} %</div>
            <div style={{ marginTop: 8 }}><strong>wheel alignment</strong><br />{guidance?.scores.wheel ?? 0} %</div>
            <div style={{ marginTop: 8 }}><strong>overall score</strong><br /><span style={{ color: scoreColor(score) }}>{score} %</span></div>
            <div style={{ marginTop: 8 }}><strong>ready</strong><br />{guidance?.ready ? '已對準' : '尚未對準'}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>車輛</h2>
            <div><strong>目標尺寸</strong><br />{formatSize(vehicleSizeDebug.target)}</div>
            <div style={{ marginTop: 8 }}><strong>目前尺寸</strong><br />{formatSize(vehicleSizeDebug.current)}</div>
            <div style={{ marginTop: 8 }}><strong>尺寸差異</strong><br />{formatPercent(vehicleSizeDebug.differencePercent)}</div>
          </article>

          <article style={{ background: 'rgba(2, 6, 23, 0.55)', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>整體狀態</h2>
            <div><strong>整體引導分數</strong><br /><span style={{ color: scoreColor(score) }}>{score} %</span></div>
            <div style={{ marginTop: 8 }}><strong>Ready</strong><br />{guidance?.ready ? '已對準' : '尚未對準'}</div>
            <div style={{ marginTop: 8 }}><strong>自動拍攝狀態</strong><br />{autoCaptureStateLabel(autoCaptureState)}</div>
            <div style={{ marginTop: 8 }}><strong>FPS</strong><br />{fps.toFixed(1)}</div>
            <div style={{ marginTop: 8 }}><strong>推論時間</strong><br />{inferenceTime.toFixed(1)} ms</div>
            <div style={{ marginTop: 8 }}><strong>車牌信心值</strong><br />{plateConfidence === undefined ? '-' : `${(plateConfidence * 100).toFixed(1)} %`}</div>
            <div style={{ marginTop: 8 }}><strong>輪胎信心值</strong><br />{wheelConfidence === undefined ? '-' : `${(wheelConfidence * 100).toFixed(1)} %`}</div>
            <div style={{ marginTop: 8 }}><strong>倒數計時</strong><br />{countdownSeconds === undefined ? '-' : `${countdownSeconds}s`}</div>
          </article>
        </section>
      </details>
      )}

      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
    </main>
  );
}
