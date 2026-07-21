import { createContext, useMemo, useState, type JSX, type ReactNode } from 'react';
import type { VehicleModel } from '../data/vehicleOptions';
import type { CaptureAngle, CapturedImage, FlowStep, GuidedCaptureSession } from '../types';

const CAPTURE_ORDER: readonly CaptureAngle[] = [
  'front-right',
  'front-left',
  'rear-left',
  'rear-right',
];

const INITIAL_SESSION: GuidedCaptureSession = {
  currentStep: 'home',
  currentAngle: 'front-right',
  vehicleModel: '',
  plateNumber: '',
  completedAngles: [],
  capturedImages: [],
};

export interface GuidedCaptureContextValue extends GuidedCaptureSession {
  progress: {
    completed: number;
    total: number;
    currentStepNumber: number;
  };
  pendingImage?: CapturedImage;
  captureOrder: readonly CaptureAngle[];
  updateVehicleModel: (vehicleModel: VehicleModel | '') => void;
  updatePlateNumber: (plateNumber: string) => void;
  syncRouteStep: (step: FlowStep) => void;
  selectCaptureAngle: (angle: CaptureAngle) => void;
  startInspection: () => void;
  captureFinished: (image?: string) => void;
  confirmCapture: () => void;
  retakeCapture: () => void;
  goBack: () => void;
  resetInspection: () => void;
}

export const GuidedCaptureContext = createContext<GuidedCaptureContextValue | undefined>(undefined);

function getCurrentStepNumber(angle: CaptureAngle): number {
  return CAPTURE_ORDER.indexOf(angle) + 1;
}

function getNextIncompleteAngle(completedAngles: readonly CaptureAngle[]): CaptureAngle | undefined {
  return CAPTURE_ORDER.find((angle) => !completedAngles.includes(angle));
}

function removeImagesForAngle(
  images: readonly CapturedImage[],
  angle: CaptureAngle,
): CapturedImage[] {
  return images.filter((image) => image.angle !== angle);
}

interface GuidedCaptureProviderProps {
  children: ReactNode;
  initialStep?: FlowStep;
}

export function GuidedCaptureProvider({
  children,
  initialStep = 'home',
}: GuidedCaptureProviderProps): JSX.Element {
  const [session, setSession] = useState<GuidedCaptureSession>({
    ...INITIAL_SESSION,
    currentStep: initialStep,
  });

  const value = useMemo<GuidedCaptureContextValue>(() => {
    const pendingImage = session.currentStep === 'review'
      ? session.capturedImages.findLast((image) => image.angle === session.currentAngle)
      : undefined;
    const progress = {
      completed: session.completedAngles.length,
      total: CAPTURE_ORDER.length,
      currentStepNumber: getCurrentStepNumber(session.currentAngle),
    };

    return {
      ...session,
      progress,
      pendingImage,
      captureOrder: CAPTURE_ORDER,
      updateVehicleModel: (vehicleModel: VehicleModel | '') => {
        setSession((current) => ({
          ...current,
          vehicleModel,
        }));
      },
      updatePlateNumber: (plateNumber: string) => {
        setSession((current) => ({
          ...current,
          plateNumber,
        }));
      },
      syncRouteStep: (step: FlowStep) => {
        setSession((current) => current.currentStep === step
          ? current
          : {
              ...current,
              currentStep: step,
            });
      },
      selectCaptureAngle: (angle: CaptureAngle) => {
        setSession((current) => {
          if (current.currentStep !== 'capture') {
            return current;
          }

          return current.currentAngle === angle
            ? current
            : {
                ...current,
                currentAngle: angle,
              };
        });
      },
      startInspection: () => {
        setSession((current) => {
          const nextIncompleteAngle = getNextIncompleteAngle(current.completedAngles);

          return {
            ...current,
            currentStep: 'capture',
            currentAngle: nextIncompleteAngle ?? CAPTURE_ORDER[0],
          };
        });
      },
      captureFinished: (image?: string) => {
        setSession((current) => {
          const capturedImage: CapturedImage = {
            angle: current.currentAngle,
            image,
            capturedAt: Date.now(),
          };

          return {
            ...current,
            currentStep: 'review',
            capturedImages: [
              ...removeImagesForAngle(current.capturedImages, current.currentAngle),
              capturedImage,
            ],
          };
        });
      },
      confirmCapture: () => {
        setSession((current) => {
          const completedAngles = current.completedAngles.includes(current.currentAngle)
            ? current.completedAngles
            : [...current.completedAngles, current.currentAngle];
          const nextAngle = getNextIncompleteAngle(completedAngles);

          if (nextAngle === undefined) {
            return {
              ...current,
              currentStep: 'complete',
              completedAngles,
            };
          }

          return {
            ...current,
            currentStep: 'capture',
            currentAngle: nextAngle,
            completedAngles,
          };
        });
      },
      retakeCapture: () => {
        setSession((current) => ({
          ...current,
          currentStep: 'capture',
          capturedImages: removeImagesForAngle(current.capturedImages, current.currentAngle),
        }));
      },
      goBack: () => {
        setSession((current) => {
          if (current.currentStep === 'review') {
            return {
              ...current,
              currentStep: 'capture',
            };
          }

          if (current.currentStep === 'capture') {
            return {
              ...current,
              currentStep: 'home',
            };
          }

          if (current.currentStep === 'complete') {
            return {
              ...current,
              currentStep: 'review',
            };
          }

          return current;
        });
      },
      resetInspection: () => {
        setSession(INITIAL_SESSION);
      },
    };
  }, [session]);

  return (
    <GuidedCaptureContext.Provider value={value}>
      {children}
    </GuidedCaptureContext.Provider>
  );
}

export { CAPTURE_ORDER };
