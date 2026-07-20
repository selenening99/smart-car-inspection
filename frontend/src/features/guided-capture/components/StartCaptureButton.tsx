import type { JSX } from 'react';

interface StartCaptureButtonProps {
  disabled?: boolean;
  onClick?: () => void;
}

export function StartCaptureButton({
  disabled = false,
  onClick,
}: StartCaptureButtonProps): JSX.Element {
  return (
    <button className="start-capture-button" disabled={disabled} onClick={onClick} type="button">
      開始拍攝
    </button>
  );
}
