import type { CalibrationObservation } from './CalibrationObservation';
import type { CaptureAngle } from '../guide/TargetLayout';

export interface CalibrationRepository {
  list(vehicleId: string, captureAngle: CaptureAngle): CalibrationObservation[];
  save(observation: CalibrationObservation): void;
  remove(observationId: string): void;
  clear(vehicleId: string, captureAngle: CaptureAngle): void;
  export(vehicleId: string, captureAngle: CaptureAngle): string;
}
