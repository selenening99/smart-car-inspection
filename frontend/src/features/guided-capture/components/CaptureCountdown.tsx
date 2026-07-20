import type { JSX } from 'react';

interface CaptureCountdownProps {
  value?: number;
}

export function CaptureCountdown({ value }: CaptureCountdownProps): JSX.Element | null {
  if (value === undefined) {
    return null;
  }

  return (
    <div aria-live="assertive" className="capture-countdown" key={value}>
      {value}
    </div>
  );
}
