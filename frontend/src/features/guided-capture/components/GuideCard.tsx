import type { JSX } from 'react';

interface GuideCardProps {
  message: string;
  ready: boolean;
}

export function GuideCard({
  message,
  ready,
}: GuideCardProps): JSX.Element {
  return (
    <section aria-live="polite" className={`guide-card${ready ? ' guide-card--ready' : ''}`}>
      <div className="guide-card__message" key={message}>
        {message}
      </div>
    </section>
  );
}
