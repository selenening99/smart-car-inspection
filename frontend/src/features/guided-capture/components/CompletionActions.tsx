import type { JSX } from 'react';

interface CompletionActionsProps {
  onDone?: () => void;
}

export function CompletionActions({ onDone }: CompletionActionsProps): JSX.Element {
  return (
    <div className="completion-actions">
      <button className="completion-actions__button" onClick={onDone} type="button">
        完成
      </button>
    </div>
  );
}
