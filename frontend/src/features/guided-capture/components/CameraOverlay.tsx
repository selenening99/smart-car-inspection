import type { JSX } from 'react';
import type { CaptureAngle } from '../types';

export type GuideFrameState = 'searching' | 'adjusting' | 'ready';

interface CameraOverlayProps {
  currentAngle?: CaptureAngle;
  instruction?: string;
  state?: GuideFrameState;
}

const angleLabels: Readonly<Record<CaptureAngle, string>> = {
  'front-left': '左前方',
  'front-right': '右前方',
  'rear-left': '左後方',
  'rear-right': '右後方',
};

export function CameraOverlay({
  currentAngle = 'front-right',
  instruction = '請將車輛完整放入框線內',
  state = 'searching',
}: CameraOverlayProps): JSX.Element {
  const angleLabel = angleLabels[currentAngle];

  return (
    <div aria-hidden="true" className={`camera-overlay camera-overlay--${state}`}>
      <div className="camera-overlay__copy">
        <div className="camera-overlay__instruction">{instruction}</div>
        <div className="camera-overlay__angle">目前拍攝：{angleLabel}</div>
      </div>

      <div className="camera-overlay__frame">
        <div className="camera-overlay__bracket camera-overlay__bracket--top-left" />
        <div className="camera-overlay__bracket camera-overlay__bracket--top-right" />
        <div className="camera-overlay__bracket camera-overlay__bracket--bottom-left" />
        <div className="camera-overlay__bracket camera-overlay__bracket--bottom-right" />
      </div>
    </div>
  );
}
