import type { JSX } from 'react';

interface CaptureProgressProps {
  completed: number;
  total: number;
}

export function CaptureProgress({
  completed,
  total,
}: CaptureProgressProps): JSX.Element {
  const progressPercent = total === 0 ? 0 : Math.min(100, Math.max(0, completed / total * 100));

  return (
    <section aria-label="拍攝進度" className="guided-capture-card capture-progress">
      <div className="capture-progress__header">
        <h2 className="capture-progress__title">拍攝進度</h2>
        <span className="capture-progress__count">{completed} / {total} 已完成</span>
      </div>

      <div aria-hidden="true" className="capture-progress__track">
        <div className="capture-progress__bar" style={{ width: `${progressPercent}%` }} />
      </div>
    </section>
  );
}
