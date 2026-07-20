import {
  getTargetLayout,
  targetRegionToGuideRectangle,
  type CaptureAngle,
  type TargetGuideRectangle,
} from '../../../guide/TargetLayout';
import type { VehicleId } from '../../../guide/VehicleProfiles';

export interface FrameSize {
  width: number;
  height: number;
}

export interface RenderedVideoFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FixedCaptureTemplateGeometry {
  plate: TargetGuideRectangle;
  wheel: TargetGuideRectangle;
}

export type ObjectFitMode = 'contain' | 'cover';

export function calculateRenderedVideoFrame(
  container: FrameSize,
  source: FrameSize,
  objectFit: ObjectFitMode,
): RenderedVideoFrame {
  if (
    container.width <= 0
    || container.height <= 0
    || source.width <= 0
    || source.height <= 0
  ) {
    return {
      x: 0,
      y: 0,
      width: Math.max(0, container.width),
      height: Math.max(0, container.height),
    };
  }

  const containerRatio = container.width / container.height;
  const sourceRatio = source.width / source.height;
  const shouldMatchWidth = objectFit === 'contain'
    ? sourceRatio >= containerRatio
    : sourceRatio <= containerRatio;
  const width = shouldMatchWidth ? container.width : container.height * sourceRatio;
  const height = shouldMatchWidth ? container.width / sourceRatio : container.height;

  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

export function createFixedCaptureTemplateGeometry(
  vehicleId: VehicleId,
  captureAngle: CaptureAngle,
  frame: RenderedVideoFrame,
): FixedCaptureTemplateGeometry {
  const targetLayout = getTargetLayout(vehicleId, captureAngle);
  const plate = targetRegionToGuideRectangle(targetLayout.plate, frame);
  const wheel = targetRegionToGuideRectangle(targetLayout.wheel, frame);

  return {
    plate: {
      x: frame.x + plate.x,
      y: frame.y + plate.y,
      width: plate.width,
      height: plate.height,
    },
    wheel: {
      x: frame.x + wheel.x,
      y: frame.y + wheel.y,
      width: wheel.width,
      height: wheel.height,
    },
  };
}
