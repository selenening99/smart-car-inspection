import type { JSX } from 'react';

export type BottomActionMode = 'disabled' | 'retake' | 'continue' | 'capture';

interface BottomActionBarProps {
  mode: BottomActionMode;
  onAction?: () => void;
}

function actionLabel(mode: BottomActionMode): string {
  if (mode === 'capture') {
    return '拍攝';
  }

  if (mode === 'retake') {
    return '重新拍攝';
  }

  if (mode === 'continue') {
    return '繼續';
  }

  return '繼續';
}

export function BottomActionBar({
  mode,
  onAction,
}: BottomActionBarProps): JSX.Element {
  return (
    <div className="bottom-action-bar">
      <button
        className="bottom-action-bar__button"
        disabled={mode === 'disabled'}
        onClick={onAction}
        type="button"
      >
        {actionLabel(mode)}
      </button>
    </div>
  );
}
