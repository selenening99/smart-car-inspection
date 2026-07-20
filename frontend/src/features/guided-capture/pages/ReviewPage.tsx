import type { JSX } from 'react';
import { CapturePreview } from '../components/CapturePreview';
import { ReviewActions } from '../components/ReviewActions';
import { ReviewHeader } from '../components/ReviewHeader';
import type { CaptureAngle } from '../types';
import '../styles/ReviewPage.css';

export type ReviewPageProps = {
  imageUrl?: string;
  currentAngle?: CaptureAngle;
  currentStep?: number;
  totalSteps?: number;
  onBack?: () => void;
  onRetake?: () => void;
  onConfirm?: () => void;
};

const angleLabels: Readonly<Record<CaptureAngle, string>> = {
  'front-left': '左前方',
  'front-right': '右前方',
  'rear-left': '左後方',
  'rear-right': '右後方',
};

export default function ReviewPage({
  imageUrl,
  currentAngle = 'front-right',
  currentStep = 2,
  totalSteps = 4,
  onBack,
  onRetake,
  onConfirm,
}: ReviewPageProps): JSX.Element {
  const angleLabel = angleLabels[currentAngle];

  return (
    <main className="guided-review-page">
      <div className="guided-review-page__shell">
        <ReviewHeader currentStep={currentStep} onBack={onBack} totalSteps={totalSteps} />

        <CapturePreview imageUrl={imageUrl} />

        <section aria-label="目前拍攝角度" className="guided-review-page__angle">
          <div className="guided-review-page__angle-title">{angleLabel}</div>
          <div className="guided-review-page__angle-step">第 {currentStep} 張，共 {totalSteps} 張</div>
        </section>

        <section aria-label="照片確認問題" className="guided-review-page__question">
          <h1 className="guided-review-page__question-title">
            請確認車輛是否完整且清晰。
          </h1>
          <p className="guided-review-page__question-text">
            請確認整台車輛皆已入鏡，且照片沒有模糊。
          </p>
        </section>

        <ReviewActions onConfirm={onConfirm} onRetake={onRetake} />
      </div>
    </main>
  );
}
