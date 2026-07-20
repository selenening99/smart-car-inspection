import type { JSX } from 'react';
import type { CaptureAngleItem } from '../types';

interface CaptureProgressBarProps {
  angles: readonly CaptureAngleItem[];
}

export function CaptureProgressBar({ angles }: CaptureProgressBarProps): JSX.Element {
  return (
    <nav aria-label="拍攝進度" className="capture-progress-bar">
      {angles.map((angle) => (
        <div className={`capture-progress-bar__item capture-progress-bar__item--${angle.state}`} key={angle.id}>
          <span className="capture-progress-bar__dot">
            {angle.state === 'completed' ? '✓' : angle.state === 'current' ? '●' : '○'}
          </span>
          <span className="capture-progress-bar__label">{angle.label}</span>
        </div>
      ))}
    </nav>
  );
}
