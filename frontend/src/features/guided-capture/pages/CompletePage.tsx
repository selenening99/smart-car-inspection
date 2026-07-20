import type { JSX } from 'react';
import { CompletionActions } from '../components/CompletionActions';
import { CompletionCard } from '../components/CompletionCard';
import { SummaryGrid } from '../components/SummaryGrid';
import type { CaptureAngle, CapturedImage } from '../types';
import '../styles/CompletePage.css';

export interface CompletePageProps {
  vehicleName?: string;
  plateNumber?: string;
  completed?: number;
  total?: number;
  capturedImages?: readonly CapturedImage[];
  captureTime?: Date;
  onDone?: () => void;
}

const captureAngles: readonly { angle: CaptureAngle; label: string }[] = [
  {
    angle: 'front-left',
    label: '左前方',
  },
  {
    angle: 'front-right',
    label: '右前方',
  },
  {
    angle: 'rear-left',
    label: '左後方',
  },
  {
    angle: 'rear-right',
    label: '右後方',
  },
];

function formatCaptureTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export default function CompletePage({
  vehicleName = 'Toyota Corolla',
  plateNumber = 'ABC-1234',
  completed = 4,
  total = 4,
  capturedImages = [],
  captureTime = new Date(),
  onDone,
}: CompletePageProps): JSX.Element {
  return (
    <main className="guided-complete-page">
      <div className="guided-complete-page__shell">
        <CompletionCard />

        <SummaryGrid
          captureTime={formatCaptureTime(captureTime)}
          completed={completed}
          plateNumber={plateNumber}
          total={total}
          vehicleName={vehicleName}
        />

        <section aria-label="已完成拍攝角度" className="completion-captures">
          {captureAngles.map(({ angle, label }) => {
            const capturedImage = capturedImages.find((image) => image.angle === angle);

            return (
              <article className="completion-capture-card" key={angle}>
                <div className="completion-capture-card__preview">
                  {capturedImage?.image === undefined ? (
                    <span>照片預覽</span>
                  ) : (
                    <img alt={`${label}拍攝照片`} className="completion-capture-card__image" src={capturedImage.image} />
                  )}
                </div>
                <div className="completion-capture-card__label">
                  <span aria-hidden="true" className="completion-capture-card__check">✓</span>
                  {label}
                </div>
              </article>
            );
          })}
        </section>

        <CompletionActions onDone={onDone} />
      </div>
    </main>
  );
}
