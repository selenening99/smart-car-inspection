import { useMemo, type JSX } from 'react';
import CameraTestPage from '../../../pages/CameraTestPage';
import type { VehicleId } from '../../../guide/VehicleProfiles';
import { BottomActionBar } from '../components/BottomActionBar';
import { CameraOverlay, type GuideFrameState } from '../components/CameraOverlay';
import { CaptureCountdown } from '../components/CaptureCountdown';
import { CaptureProgressBar } from '../components/CaptureProgressBar';
import { GuideCard } from '../components/GuideCard';
import { TopNavigation } from '../components/TopNavigation';
import type { CaptureAngle, CaptureAngleItem } from '../types';
import '../styles/CapturePage.css';

const defaultCurrentStep = 2;
const defaultTotalSteps = 4;
const defaultVehicleId: VehicleId = 'yaris';

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
  onCaptureFinished,
  vehicleId = defaultVehicleId,
}: CapturePageProps): JSX.Element {
  return (
    <CameraTestPage
      captureAngle={currentAngle}
      currentStep={currentStep}
      mode="production"
      onCaptureFinished={onCaptureFinished}
      totalSteps={totalSteps}
      vehicleId={vehicleId}
    />
  );
}

export default function CapturePage(props: CapturePageProps): JSX.Element {
  if (props.previewMode === true) {
    return <PreviewCapturePage {...props} />;
  }

  return <EngineCapturePage {...props} />;
}
