import type { JSX } from 'react';

interface ReviewHeaderProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
}

export function ReviewHeader({
  currentStep,
  totalSteps,
  onBack,
}: ReviewHeaderProps): JSX.Element {
  return (
    <header className="review-header">
      <button
        aria-label="返回拍攝"
        className="review-header__back"
        onClick={onBack}
        type="button"
      >
        返回
      </button>

      <div className="review-header__title">確認照片</div>

      <div aria-label={`第 ${currentStep} 張，共 ${totalSteps} 張`} className="review-header__step">
        {currentStep} / {totalSteps}
      </div>
    </header>
  );
}
