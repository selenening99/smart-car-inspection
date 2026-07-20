import type { JSX } from 'react';
import type { CaptureAngleItem } from '../types';
import { CaptureAngleCard } from './CaptureAngleCard';

interface CaptureAngleGridProps {
  angles: readonly CaptureAngleItem[];
}

export function CaptureAngleGrid({ angles }: CaptureAngleGridProps): JSX.Element {
  return (
    <section aria-label="Required capture angles" className="capture-angle-grid">
      {angles.map((angle) => (
        <CaptureAngleCard angle={angle} key={angle.id} />
      ))}
    </section>
  );
}
