import type { JSX } from 'react';

interface ReviewActionsProps {
  onRetake?: () => void;
  onConfirm?: () => void;
}

export function ReviewActions({
  onRetake,
  onConfirm,
}: ReviewActionsProps): JSX.Element {
  return (
    <div aria-label="照片確認操作" className="review-actions">
      <button
        className="review-actions__button review-actions__button--secondary"
        onClick={onRetake}
        type="button"
      >
        重新拍攝
      </button>

      <button
        className="review-actions__button review-actions__button--primary"
        onClick={onConfirm}
        type="button"
      >
        確認使用
      </button>
    </div>
  );
}
