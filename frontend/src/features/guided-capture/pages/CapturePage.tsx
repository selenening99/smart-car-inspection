import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { BottomActionBar } from '../components/BottomActionBar';
import { CameraOverlay, type GuideFrameState } from '../components/CameraOverlay';
import { CaptureCountdown } from '../components/CaptureCountdown';
import { CaptureProgressBar } from '../components/CaptureProgressBar';
import { FixedCaptureTemplate } from '../components/FixedCaptureTemplate';
import { GuideCard } from '../components/GuideCard';
import { TopNavigation } from '../components/TopNavigation';
import { CAMERA_PREVIEW_MIRRORED } from '../../../pages/CameraAngleValidation';
import { createGuidedCaptureEngineState } from '../integration/GuidedCaptureAdapter';
import { calculateRenderedVideoFrame, type FrameSize } from '../integration/FixedCaptureTemplateGeometry';
import { useGuidedCaptureEngine } from '../integration/useGuidedCaptureEngine';
import type { CaptureAngle, CaptureAngleItem } from '../types';
import type { VehicleId } from '../../../guide/VehicleProfiles';
import '../styles/CapturePage.css';

const defaultCurrentStep = 2;
const defaultTotalSteps = 4;
const defaultVehicleId: VehicleId = 'yaris';
const ENABLE_MANUAL_CAPTURE_FALLBACK = false;

const orderedCaptureAngles: readonly Pick<CaptureAngleItem, 'id' | 'label'>[] = [
  {
    id: 'front-left',
    label: '左前方',
  },
  {
    id: 'front-right',
    label: '右前方',
  },
  {
    id: 'rear-left',
    label: '左後方',
  },
  {
    id: 'rear-right',
    label: '右後方',
  },
];

export interface CapturePageProps {
  currentAngle?: CaptureAngle;
  currentStep?: number;
  totalSteps?: number;
  completedAngles?: readonly CaptureAngle[];
  onBack?: () => void;
  onCaptureFinished?: (image?: string) => void;
  demoMode?: boolean;
  previewMode?: boolean;
  vehicleId?: VehicleId;
}

function createProgressAngles(
  currentAngle: CaptureAngle,
  completedAngles: readonly CaptureAngle[],
): readonly CaptureAngleItem[] {
  return orderedCaptureAngles.map((angle) => {
    if (completedAngles.includes(angle.id)) {
      return {
        ...angle,
        state: 'completed',
      };
    }

    if (angle.id === currentAngle) {
      return {
        ...angle,
        state: 'current',
      };
    }

    return {
      ...angle,
      state: 'pending',
    };
  });
}

function PreviewCapturePage({
  currentAngle = 'front-right',
  currentStep = defaultCurrentStep,
  totalSteps = defaultTotalSteps,
  completedAngles = ['front-left'],
  onBack,
}: CapturePageProps): JSX.Element {
  const progressAngles = useMemo(
    () => createProgressAngles(currentAngle, completedAngles),
    [completedAngles, currentAngle],
  );
  const guideFrameState: GuideFrameState = 'adjusting';

  return (
    <main className="guided-capture-screen">
      <div className="guided-capture-screen__shell">
        <TopNavigation currentStep={currentStep} onBack={onBack} totalSteps={totalSteps} />

        <section aria-label="相機預覽" className="guided-capture-camera-area">
          <div className="guided-capture-camera-frame">
            <div className="guided-capture-camera-frame__placeholder">
              相機預覽
            </div>
            <CameraOverlay
              currentAngle={currentAngle}
              instruction="請將車輛完整放入框內"
              state={guideFrameState}
            />
            <CaptureCountdown value={3} />
            <GuideCard message="請再靠近一些" ready={false} />
          </div>
        </section>

        <section aria-label="拍攝控制" className="guided-capture-bottom">
          <CaptureProgressBar angles={progressAngles} />
          <BottomActionBar mode="disabled" />
        </section>
      </div>
    </main>
  );
}

function EngineCapturePage({
  currentAngle = 'front-right',
  currentStep = defaultCurrentStep,
  totalSteps = defaultTotalSteps,
  completedAngles = ['front-left'],
  onBack,
  onCaptureFinished,
  vehicleId = defaultVehicleId,
}: CapturePageProps): JSX.Element {
  const deliveredCaptureRef = useRef<string | undefined>(undefined);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const [previewContainerSize, setPreviewContainerSize] = useState<FrameSize>({ width: 0, height: 0 });
  const engine = useGuidedCaptureEngine({
    vehicleId,
    captureAngle: currentAngle,
    enableManualCaptureFallback: ENABLE_MANUAL_CAPTURE_FALLBACK,
    revokePreviewUrlOnUnmount: false,
  });
  const uiState = createGuidedCaptureEngineState({
    autoCaptureState: engine.autoCaptureState,
    cameraError: engine.cameraError,
    capturedImage: engine.capturedImage,
    countdownMilliseconds: engine.countdownMilliseconds,
    currentAngle,
    detections: engine.detections,
    frame: engine.frame,
    guidance: engine.guidance,
  });
  const progressAngles = useMemo(
    () => createProgressAngles(currentAngle, completedAngles),
    [completedAngles, currentAngle],
  );
  const renderedVideoFrame = useMemo(
    () => calculateRenderedVideoFrame(previewContainerSize, engine.frame, 'contain'),
    [engine.frame, previewContainerSize],
  );

  useEffect(() => {
    const element = previewFrameRef.current;

    if (element === null) {
      return;
    }

    const updatePreviewSize = (): void => {
      const rect = element.getBoundingClientRect();
      setPreviewContainerSize({ width: rect.width, height: rect.height });
    };

    updatePreviewSize();
    const observer = new ResizeObserver(updatePreviewSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      engine.capturedImage !== undefined
      && deliveredCaptureRef.current !== engine.capturedImage.capturedAt
    ) {
      deliveredCaptureRef.current = engine.capturedImage.capturedAt;
      onCaptureFinished?.(engine.capturedImage.previewUrl);
    }
  }, [engine.capturedImage, onCaptureFinished]);

  return (
    <main className="guided-capture-screen">
      <div className="guided-capture-screen__shell">
        <TopNavigation currentStep={currentStep} onBack={onBack} totalSteps={totalSteps} />

        <section aria-label="相機預覽" className="guided-capture-camera-area">
          <div className="guided-capture-camera-frame guided-capture-camera-frame--engine" ref={previewFrameRef}>
            <video
              autoPlay
              className="guided-capture-camera-frame__video guided-capture-camera-frame__video--engine"
              muted
              onLoadedMetadata={engine.updateVideoFrame}
              playsInline
              ref={engine.videoRef}
              style={{ transform: CAMERA_PREVIEW_MIRRORED ? 'scaleX(-1)' : 'none' }}
            />
            <FixedCaptureTemplate
              captureAngle={currentAngle}
              frame={renderedVideoFrame}
              guideMessage={uiState.guidanceMessage}
              guideState={uiState.guideFrameState}
              plateReady={engine.guidance?.componentReady.plate}
              vehicleId={vehicleId}
              wheelReady={engine.guidance?.componentReady.wheel}
            />
            <CaptureCountdown value={uiState.countdown ?? undefined} />
          </div>
        </section>

        <section aria-label="拍攝控制" className="guided-capture-bottom">
          <CaptureProgressBar angles={progressAngles} />
          {ENABLE_MANUAL_CAPTURE_FALLBACK && (
            <BottomActionBar mode="capture" onAction={() => engine.captureCurrentFrame('manual')} />
          )}
        </section>
      </div>

      <canvas className="guided-capture-camera-frame__capture-canvas" ref={engine.captureCanvasRef} />
    </main>
  );
}

export default function CapturePage(props: CapturePageProps): JSX.Element {
  if (props.previewMode === true) {
    return <PreviewCapturePage {...props} />;
  }

  return <EngineCapturePage {...props} />;
}
