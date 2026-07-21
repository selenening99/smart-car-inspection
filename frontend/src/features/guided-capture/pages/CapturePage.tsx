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
    id: 'front-right',
    label: '右前方',
  },
  {
    id: 'front-left',
    label: '左前方',
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
  onAngleSelect?: (angle: CaptureAngle) => void;
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
  completedAngles = [],
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
  completedAngles = [],
  onBack,
  onAngleSelect,
  onCaptureFinished,
  vehicleId = defaultVehicleId,
}: CapturePageProps): JSX.Element {
  const progressAngles = useMemo(
    () => createProgressAngles(currentAngle, completedAngles),
    [completedAngles, currentAngle],
  );
  const currentAngleLabel = orderedCaptureAngles.find((angle) => angle.id === currentAngle)?.label ?? '右前方';

  return (
    <main className="guided-capture-screen">
      <div className="guided-capture-screen__shell">
        <TopNavigation currentStep={currentStep} onBack={onBack} totalSteps={totalSteps} />

        <section aria-label="相機預覽" className="guided-capture-camera-area">
          <CameraTestPage
            captureAngle={currentAngle}
            currentStep={currentStep}
            mode="production"
            onCaptureFinished={onCaptureFinished}
            totalSteps={totalSteps}
            vehicleId={vehicleId}
          />
        </section>

        <section
          aria-label="目前拍攝角度"
          style={{
            alignItems: 'center',
            color: '#f5f5f7',
            display: 'flex',
            justifyContent: 'space-between',
            margin: '0 auto',
            maxWidth: 560,
            width: '100%',
          }}
        >
          <span
            style={{
              color: 'rgba(245, 245, 247, 0.68)',
              fontSize: 14,
              fontWeight: 720,
            }}
          >
            目前拍攝
          </span>
          <strong
            style={{
              fontSize: 24,
              fontWeight: 840,
              letterSpacing: '-0.04em',
            }}
          >
            {currentAngleLabel}
          </strong>
        </section>

        <section aria-label="拍攝進度" className="guided-capture-bottom">
          <nav aria-label="拍攝角度選擇" className="capture-progress-bar">
            {progressAngles.map((angle) => {
              const completed = completedAngles.includes(angle.id);
              const current = angle.id === currentAngle;

              return (
                <button
                  aria-current={current ? 'step' : undefined}
                  aria-label={`選擇${angle.label}拍攝角度`}
                  className={`capture-progress-bar__item capture-progress-bar__item--${angle.state}${current ? ' capture-progress-bar__item--current' : ''}`}
                  key={angle.id}
                  onClick={() => onAngleSelect?.(angle.id)}
                  type="button"
                >
                  <span className="capture-progress-bar__dot">
                    {completed ? '✓' : current ? '●' : '○'}
                  </span>
                  <span className="capture-progress-bar__label">{angle.label}</span>
                </button>
              );
            })}
          </nav>
        </section>
      </div>
    </main>
  );
}

export default function CapturePage(props: CapturePageProps): JSX.Element {
  if (props.previewMode === true) {
    return <PreviewCapturePage {...props} />;
  }

  return <EngineCapturePage {...props} />;
}
