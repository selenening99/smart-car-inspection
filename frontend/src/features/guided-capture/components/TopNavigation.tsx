import type { JSX } from 'react';

interface TopNavigationProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
}

export function TopNavigation({
  currentStep,
  totalSteps,
  onBack,
}: TopNavigationProps): JSX.Element {
  return (
    <header className="guided-capture-top-nav">
      <button className="guided-capture-top-nav__back" onClick={onBack} type="button">
        返回
      </button>
      <div className="guided-capture-top-nav__title">車輛拍攝</div>
      <div aria-label={`第 ${currentStep} 張，共 ${totalSteps} 張`} className="guided-capture-top-nav__step">
        {currentStep} / {totalSteps}
      </div>
    </header>
  );
}
