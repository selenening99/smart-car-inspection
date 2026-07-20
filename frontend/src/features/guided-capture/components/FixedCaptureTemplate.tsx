import { useMemo, type CSSProperties, type JSX } from 'react';
import { angleLabel, type CaptureAngle, type TargetGuideRectangle } from '../../../guide/TargetLayout';
import type { VehicleId } from '../../../guide/VehicleProfiles';
import {
  createFixedCaptureTemplateGeometry,
  type RenderedVideoFrame,
} from '../integration/FixedCaptureTemplateGeometry';
import type { GuideFrameState } from './CameraOverlay';

export interface FixedCaptureTemplateProps {
  vehicleId: VehicleId;
  captureAngle: CaptureAngle;
  frame: RenderedVideoFrame;
  guideState: GuideFrameState;
  guideMessage: string;
  plateReady?: boolean;
  wheelReady?: boolean;
}

export function FixedCaptureTemplate({
  vehicleId,
  captureAngle,
  frame,
  guideState,
  guideMessage,
  plateReady = false,
  wheelReady = false,
}: FixedCaptureTemplateProps): JSX.Element {
  const geometry = useMemo(
    () => createFixedCaptureTemplateGeometry(vehicleId, captureAngle, frame),
    [captureAngle, frame, vehicleId],
  );

  return (
    <div
      aria-hidden="true"
      className={`fixed-capture-template fixed-capture-template--${guideState}`}
    >
      <div className="fixed-capture-template__angle-badge">
        <span className="fixed-capture-template__angle-label">目前拍攝</span>
        <span className="fixed-capture-template__angle-value">{angleLabel(captureAngle)}</span>
      </div>

      <TemplateTarget
        label="車牌"
        modifier="plate"
        ready={plateReady}
        rectangle={geometry.plate}
      />

      <TemplateTarget
        label="輪胎"
        modifier="wheel"
        ready={wheelReady}
        rectangle={geometry.wheel}
      />

      <div className="fixed-capture-template__message">
        {guideMessage}
      </div>
    </div>
  );
}

function TemplateTarget({
  label,
  modifier,
  ready,
  rectangle,
}: {
  label: string;
  modifier: 'plate' | 'wheel';
  ready: boolean;
  rectangle: TargetGuideRectangle;
}): JSX.Element {
  return (
    <div
      className={`fixed-capture-template__target fixed-capture-template__target--${modifier}${ready ? ' fixed-capture-template__target--ready' : ''}`}
      style={rectangleToStyle(rectangle)}
    >
      <span className="fixed-capture-template__target-label">{label}</span>
    </div>
  );
}

function rectangleToStyle(rectangle: TargetGuideRectangle): CSSProperties {
  return {
    height: `${rectangle.height}px`,
    left: `${rectangle.x}px`,
    top: `${rectangle.y}px`,
    width: `${rectangle.width}px`,
  };
}
