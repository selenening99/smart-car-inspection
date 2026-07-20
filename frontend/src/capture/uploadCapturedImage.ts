import type { CaptureAngle } from '../guide/TargetLayout';

export interface CaptureCenter {
  x: number;
  y: number;
}

export interface UploadCapturedImageInput {
  blob: Blob;
  vehicleId: string;
  captureAngle: CaptureAngle;
  captureSource: 'automatic' | 'manual';
  guidanceScore: number;
  plateCenter?: CaptureCenter;
  wheelCenter?: CaptureCenter;
  targetPlateCenter: CaptureCenter;
  targetWheelCenter: CaptureCenter;
  capturedAt: string;
}

/**
 * Provider-independent placeholder for future upload integration.
 * This function intentionally performs no networking.
 */
export async function uploadCapturedImage(input: UploadCapturedImageInput): Promise<void> {
  void input;
}
