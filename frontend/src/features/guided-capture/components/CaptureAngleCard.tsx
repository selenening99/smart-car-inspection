import type { JSX } from 'react';
import type { CaptureAngleItem } from '../types';

interface CaptureAngleCardProps {
  angle: CaptureAngleItem;
}

function stateLabel(state: CaptureAngleItem['state']): string {
  if (state === 'completed') {
    return '已完成';
  }

  if (state === 'current') {
    return '目前拍攝';
  }

  return '待拍攝';
}

export function CaptureAngleCard({ angle }: CaptureAngleCardProps): JSX.Element {
  return (
    <article
      aria-current={angle.state === 'current' ? 'step' : undefined}
      aria-label={`${angle.label}, ${stateLabel(angle.state)}`}
      className={`capture-angle-card capture-angle-card--${angle.state}`}
    >
      {angle.state === 'completed' && <div aria-hidden="true" className="capture-angle-card__check">✓</div>}
      <div className="capture-angle-card__label">{angle.label}</div>
      <div className="capture-angle-card__state">{stateLabel(angle.state)}</div>
    </article>
  );
}
