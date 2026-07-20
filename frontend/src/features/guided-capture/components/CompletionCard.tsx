import type { JSX } from 'react';

export function CompletionCard(): JSX.Element {
  return (
    <section className="completion-card">
      <div aria-hidden="true" className="completion-card__icon">✓</div>
      <h1 className="completion-card__title">拍攝完成</h1>
      <p className="completion-card__subtitle">
        四個角度的車輛照片都已完成。
      </p>
    </section>
  );
}
