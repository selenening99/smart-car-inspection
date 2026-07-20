import type { JSX } from 'react';

interface CapturePreviewProps {
  imageUrl?: string;
}

export function CapturePreview({ imageUrl }: CapturePreviewProps): JSX.Element {
  return (
    <section aria-label="照片預覽" className="capture-preview">
      {imageUrl === undefined ? (
        <div className="capture-preview__placeholder">照片預覽</div>
      ) : (
        <img alt="已拍攝的車輛照片" className="capture-preview__image" src={imageUrl} />
      )}
    </section>
  );
}
