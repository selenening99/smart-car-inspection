import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web';
import type { BoxDetection } from '../../../ai/postprocess/BoxConverter';
import { convertXYWHToXYXY } from '../../../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../../../ai/postprocess/ConfidenceFilter';
import { recoverOriginalCoordinates } from '../../../ai/postprocess/CoordinateMapper';
import { decode, type RawDetection } from '../../../ai/postprocess/Decoder';
import { classWiseNMS } from '../../../ai/postprocess/NMS';
import { runDetector } from '../../../ai/detector/Detector';
import { letterbox } from '../../../ai/preprocess/Letterbox';
import { preprocess } from '../../../ai/preprocess/Preprocess';
import { AutoCaptureController, AutoCaptureState } from '../../../capture/AutoCaptureController';
import type { UploadCapturedImageInput } from '../../../capture/uploadCapturedImage';
import type { GuidanceState } from '../../../guide/GuidanceEngine';
import { calculateGuidanceState } from '../../../guide/GuidanceEngine';
import type { CaptureAngle } from '../../../guide/TargetLayout';
import { getTargetLayout } from '../../../guide/TargetLayout';
import type { VehicleId } from '../../../guide/VehicleProfiles';
import {
  CAMERA_FACING_MODE,
  createCapturedImageUploadInput,
  resetAngleDependentCaptureState,
  validateSelectedAngleLayout,
} from '../../../pages/CameraAngleValidation';

const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;

type CaptureSource = 'automatic' | 'manual';
type DecoderCompatibleResult = ReturnType<typeof decode> | RawDetection[];

export interface CameraFrame {
  width: number;
  height: number;
}

export interface EngineCapturedImage {
  previewUrl: string;
  uploadInput: UploadCapturedImageInput;
  capturedAt: string;
}

export interface UseGuidedCaptureEngineParams {
  vehicleId: VehicleId;
  captureAngle: CaptureAngle;
  enableManualCaptureFallback?: boolean;
  revokePreviewUrlOnUnmount?: boolean;
}

export interface GuidedCaptureEngine {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  captureCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  frame: CameraFrame;
  detections: BoxDetection[];
  guidance?: GuidanceState;
  fps: number;
  inferenceTime: number;
  autoCaptureState: AutoCaptureState;
  countdownMilliseconds?: number;
  capturedImage?: EngineCapturedImage;
  cameraError?: string;
  cameraFacingMode: string;
  targetLayout: ReturnType<typeof getTargetLayout>;
  layoutGuard: ReturnType<typeof validateSelectedAngleLayout>;
  captureCurrentFrame: (source?: CaptureSource) => void;
  retake: () => void;
  clearCapturedImage: () => void;
  updateVideoFrame: () => void;
  enableManualCaptureFallback: boolean;
}

function getDecodedDetections(decoded: DecoderCompatibleResult): RawDetection[] {
  if (Array.isArray(decoded)) {
    return decoded;
  }

  return decoded.detections;
}

export function useGuidedCaptureEngine({
  vehicleId,
  captureAngle,
  enableManualCaptureFallback = false,
  revokePreviewUrlOnUnmount = true,
}: UseGuidedCaptureEngineParams): GuidedCaptureEngine {
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
  const [fps, setFps] = useState(0);
  const [inferenceTime, setInferenceTime] = useState(0);
  const [autoCaptureState, setAutoCaptureState] = useState<AutoCaptureState>(AutoCaptureState.Idle);
  const [countdownMilliseconds, setCountdownMilliseconds] = useState<number>();
  const [capturedImage, setCapturedImage] = useState<EngineCapturedImage>();
  const [cameraError, setCameraError] = useState<string>();
  const [cameraFacingMode, setCameraFacingMode] = useState(CAMERA_FACING_MODE);

  const targetLayout = useMemo(() => getTargetLayout(vehicleId, captureAngle), [captureAngle, vehicleId]);
  const layoutGuard = useMemo(
    () => validateSelectedAngleLayout(captureAngle, targetLayout),
    [captureAngle, targetLayout],
  );

  const clearCapturedImage = useCallback((): void => {
    if (previewUrlRef.current !== undefined) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = undefined;
    }

    setCapturedImage(undefined);
  }, []);

  useEffect(() => {
    selectedAngleRef.current = captureAngle;
    targetLayoutRef.current = targetLayout;
    layoutGuardRef.current = layoutGuard;
    guidanceRef.current = undefined;
    reviewActiveRef.current = false;

    clearCapturedImage();
    setGuidance(undefined);
    setDetections([]);
    setCountdownMilliseconds(undefined);
    setAutoCaptureState(resetAngleDependentCaptureState(autoCaptureRef.current));
  }, [captureAngle, clearCapturedImage, layoutGuard, targetLayout]);

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
      setCountdownMilliseconds(undefined);
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
      const uploadInput = createCapturedImageUploadInput({
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
      setCapturedImage({ previewUrl, uploadInput, capturedAt });
      setCountdownMilliseconds(undefined);

      if (source === 'automatic') {
        controller.complete();
      }

      setAutoCaptureState(controller.state);
    }, 'image/png');
  }, [vehicleId]);

  const retake = useCallback((): void => {
    const controller = autoCaptureRef.current;

    clearCapturedImage();
    reviewActiveRef.current = false;
    setCountdownMilliseconds(undefined);

    if (controller !== null) {
      controller.reset();
      setAutoCaptureState(controller.state);
    }
  }, [clearCapturedImage]);

  const updateVideoFrame = useCallback((): void => {
    const video = videoRef.current;

    if (video !== null && video.videoWidth > 0) {
      setFrame({ width: video.videoWidth, height: video.videoHeight });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AutoCaptureController({
      onCountdown: (remainingMilliseconds) => setCountdownMilliseconds(remainingMilliseconds),
      onCapture: () => captureCurrentFrame('automatic'),
      onCancel: () => setCountdownMilliseconds(undefined),
    });
    autoCaptureRef.current = controller;
    setAutoCaptureState(controller.state);

    return () => {
      mountedRef.current = false;
      autoCaptureRef.current = null;
      if (revokePreviewUrlOnUnmount) {
        clearCapturedImage();
      }
    };
  }, [captureCurrentFrame, clearCapturedImage, revokePreviewUrlOnUnmount]);

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
            setCountdownMilliseconds(undefined);
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

  return {
    videoRef,
    captureCanvasRef,
    frame,
    detections,
    guidance,
    fps,
    inferenceTime,
    autoCaptureState,
    countdownMilliseconds,
    capturedImage,
    cameraError,
    cameraFacingMode,
    targetLayout,
    layoutGuard,
    captureCurrentFrame,
    retake,
    clearCapturedImage,
    updateVideoFrame,
    enableManualCaptureFallback,
  };
}
