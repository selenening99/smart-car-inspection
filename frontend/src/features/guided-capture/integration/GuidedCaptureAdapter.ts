import { AutoCaptureState } from '../../../capture/AutoCaptureController';
import type { BoxDetection } from '../../../ai/postprocess/BoxConverter';
import type { GuidanceState } from '../../../guide/GuidanceEngine';
import type { CaptureAngle } from '../../../guide/TargetLayout';
import type { GuideFrameState } from '../components/CameraOverlay';
import type { CameraFrame, EngineCapturedImage } from './useGuidedCaptureEngine';

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GuidedCaptureCameraStatus =
  | 'idle'
  | 'requesting-permission'
  | 'ready'
  | 'permission-denied'
  | 'unavailable'
  | 'error';

export type GuidedCaptureModelStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error';

export type GuidedCaptureGuidanceStatus =
  | 'searching'
  | 'adjusting'
  | 'stable'
  | 'countdown'
  | 'captured';

export type GuidedCaptureEngineState = {
  cameraStatus: GuidedCaptureCameraStatus;
  modelStatus: GuidedCaptureModelStatus;
  guidanceStatus: GuidedCaptureGuidanceStatus;
  guideFrameState: GuideFrameState;
  guidanceMessage: string;
  countdown: number | null;
  detections: {
    plate?: NormalizedBox;
    wheel?: NormalizedBox;
  };
  capturedImage?: string;
  capturedImagePayload?: EngineCapturedImage;
  isAutoCaptureReady: boolean;
};

function detectionToNormalizedBox(detection: BoxDetection, frame: CameraFrame): NormalizedBox {
  return {
    x: detection.x1 / frame.width,
    y: detection.y1 / frame.height,
    width: (detection.x2 - detection.x1) / frame.width,
    height: (detection.y2 - detection.y1) / frame.height,
  };
}

function highestConfidenceDetection(
  detections: readonly BoxDetection[],
  classId: number,
): BoxDetection | undefined {
  let selected: BoxDetection | undefined;

  for (const detection of detections) {
    if (detection.classId === classId && (selected === undefined || detection.confidence > selected.confidence)) {
      selected = detection;
    }
  }

  return selected;
}

function translateGuidanceHint(hint: string): string {
  const hintMap: Readonly<Record<string, string>> = {
    'License plate not detected': '尚未偵測到車牌',
    'Wheel not detected': '尚未偵測到輪胎',
    'Move Left': '請向左移動',
    'Move Right': '請向右移動',
    'Move Up': '請抬高手機',
    'Move Down': '請放低手機',
    'Move Closer': '請再靠近一些',
    'Move Farther': '請稍微後退',
    '請將手機向左移動': '請向左移動',
    '請將手機向右移動': '請向右移動',
    '請將手機向上移動': '請抬高手機',
    '請將手機向下移動': '請放低手機',
    '請靠近車輛': '請再靠近一些',
    '請遠離車輛': '請稍微後退',
    '請調整拍攝角度': '請調整拍攝角度',
    '請保持手機穩定': '請保持穩定',
  };

  return hintMap[hint] ?? hint;
}

function guidanceMessageFromState(
  guidance: GuidanceState | undefined,
  autoCaptureState: AutoCaptureState,
  cameraError: string | undefined,
): string {
  if (cameraError !== undefined) {
    return cameraError;
  }

  if (autoCaptureState === AutoCaptureState.CountingDown) {
    return '已對準，請保持不動';
  }

  if (autoCaptureState === AutoCaptureState.Completed) {
    return '拍攝完成';
  }

  if (guidance === undefined) {
    return '正在啟動相機';
  }

  if (guidance.ready) {
    return '已對準，請保持不動';
  }

  if (guidance.hints.length > 0) {
    return translateGuidanceHint(guidance.hints[0]);
  }

  return '請保持穩定';
}

function guidanceStatusFromState(
  guidance: GuidanceState | undefined,
  autoCaptureState: AutoCaptureState,
  capturedImage: EngineCapturedImage | undefined,
): GuidedCaptureGuidanceStatus {
  if (capturedImage !== undefined || autoCaptureState === AutoCaptureState.Completed) {
    return 'captured';
  }

  if (autoCaptureState === AutoCaptureState.CountingDown || autoCaptureState === AutoCaptureState.Capturing) {
    return 'countdown';
  }

  if (guidance?.ready === true) {
    return 'stable';
  }

  if (guidance === undefined || (!guidance.plateDetected && !guidance.wheelDetected)) {
    return 'searching';
  }

  return 'adjusting';
}

export function createGuidedCaptureEngineState({
  autoCaptureState,
  cameraError,
  capturedImage,
  countdownMilliseconds,
  detections,
  frame,
  guidance,
}: {
  autoCaptureState: AutoCaptureState;
  cameraError?: string;
  capturedImage?: EngineCapturedImage;
  countdownMilliseconds?: number;
  detections: readonly BoxDetection[];
  frame: CameraFrame;
  guidance?: GuidanceState;
  currentAngle: CaptureAngle;
}): GuidedCaptureEngineState {
  const guidanceStatus = guidanceStatusFromState(guidance, autoCaptureState, capturedImage);
  const plate = highestConfidenceDetection(detections, 0);
  const wheel = highestConfidenceDetection(detections, 1);

  return {
    cameraStatus: cameraError === undefined ? 'ready' : 'error',
    modelStatus: guidance === undefined && cameraError === undefined ? 'loading' : cameraError === undefined ? 'ready' : 'error',
    guidanceStatus,
    guideFrameState: guidanceStatus === 'stable' || guidanceStatus === 'countdown' || guidanceStatus === 'captured'
      ? 'ready'
      : guidanceStatus === 'adjusting'
        ? 'adjusting'
        : 'searching',
    guidanceMessage: guidanceMessageFromState(guidance, autoCaptureState, cameraError),
    countdown: countdownMilliseconds === undefined ? null : Math.ceil(countdownMilliseconds / 1000),
    detections: {
      plate: plate === undefined ? undefined : detectionToNormalizedBox(plate, frame),
      wheel: wheel === undefined ? undefined : detectionToNormalizedBox(wheel, frame),
    },
    capturedImage: capturedImage?.previewUrl,
    capturedImagePayload: capturedImage,
    isAutoCaptureReady: guidance?.ready === true,
  };
}
