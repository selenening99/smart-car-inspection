import type { VehicleModel } from '../data/vehicleOptions';

export type FlowStep =
  | 'home'
  | 'capture'
  | 'review'
  | 'complete';

export type CaptureAngle =
  | 'front-left'
  | 'front-right'
  | 'rear-left'
  | 'rear-right';

export type CaptureAngleId = CaptureAngle;

export type CaptureAngleState = 'completed' | 'current' | 'pending';

export interface CaptureAngleItem {
  id: CaptureAngle;
  label: string;
  state: CaptureAngleState;
}

export type CapturedImage = {
  angle: CaptureAngle;
  image?: string;
  capturedAt: number;
};

export type GuidedCaptureSession = {
  currentStep: FlowStep;
  currentAngle: CaptureAngle;
  vehicleModel: VehicleModel | '';
  plateNumber: string;
  completedAngles: CaptureAngle[];
  capturedImages: CapturedImage[];
};

export interface GuidedCaptureTask {
  completed: number;
  total: number;
}
