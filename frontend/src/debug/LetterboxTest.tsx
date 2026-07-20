import { useEffect, useState } from 'react';
import sampleImageUrl from '../assets/hero.png';
import { letterbox } from '../ai/preprocess/Letterbox';

interface LetterboxMetrics {
  originalWidth: number;
  originalHeight: number;
  resizedWidth: number;
  resizedHeight: number;
  scale: number;
  padX: number;
  padY: number;
  borderLeft: number;
  borderTop: number;
}

const TARGET_SIZE = 640;

/**
 * A standalone visual check for the letterbox implementation.
 *
 * This component intentionally uses one local image and calls only `letterbox`.
 * It does not create a tensor, load a model, or invoke YOLO.
 */
export function LetterboxTest(): React.JSX.Element {
  const [letterboxedImageUrl, setLetterboxedImageUrl] = useState<string>();
  const [metrics, setMetrics] = useState<LetterboxMetrics>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    const image = new Image();

    image.onload = () => {
      const result = letterbox(image, image.naturalWidth, image.naturalHeight, TARGET_SIZE);

      // These use the same ±0.1 padding split as Python's letterbox function.
      // `padX` and `padY` are always integral or half-integral, so Math.round
      // produces the same border dimensions after this offset.
      const borderLeft = Math.round(result.padX - 0.1);
      const borderRight = Math.round(result.padX + 0.1);
      const borderTop = Math.round(result.padY - 0.1);
      const borderBottom = Math.round(result.padY + 0.1);

      if (!isMounted) {
        return;
      }

      setLetterboxedImageUrl(result.canvas.toDataURL('image/png'));
      setMetrics({
        originalWidth: image.naturalWidth,
        originalHeight: image.naturalHeight,
        resizedWidth: result.canvas.width - borderLeft - borderRight,
        resizedHeight: result.canvas.height - borderTop - borderBottom,
        scale: result.scale,
        padX: result.padX,
        padY: result.padY,
        borderLeft,
        borderTop,
      });
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The letterbox sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1400, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Letterbox verification</h1>
      <p>This debug page loads one local sample image and applies only the letterbox resize-and-padding step.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      {metrics !== undefined && letterboxedImageUrl !== undefined && (
        <>
          <section style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <figure style={{ margin: 0 }}>
              <figcaption style={{ fontWeight: 700, marginBottom: 8 }}>Original image</figcaption>
              <img
                alt="Original letterbox sample"
                src={sampleImageUrl}
                style={{ border: '1px solid #9ca3af', display: 'block', height: 'auto', maxWidth: '100%' }}
              />
            </figure>

            <figure style={{ margin: 0 }}>
              <figcaption style={{ fontWeight: 700, marginBottom: 8 }}>Letterboxed image</figcaption>
              <div style={{ maxWidth: TARGET_SIZE, position: 'relative' }}>
                <img
                  alt="Letterboxed sample with padding"
                  src={letterboxedImageUrl}
                  style={{ border: '1px solid #9ca3af', display: 'block', height: 'auto', width: '100%' }}
                />
                <div
                  aria-label="Resized image boundary"
                  style={{
                    border: '3px dashed #ef4444',
                    boxSizing: 'border-box',
                    height: `${(metrics.resizedHeight / TARGET_SIZE) * 100}%`,
                    left: `${(metrics.borderLeft / TARGET_SIZE) * 100}%`,
                    pointerEvents: 'none',
                    position: 'absolute',
                    top: `${(metrics.borderTop / TARGET_SIZE) * 100}%`,
                    width: `${(metrics.resizedWidth / TARGET_SIZE) * 100}%`,
                  }}
                />
              </div>
              <p style={{ marginBottom: 0 }}>
                Gray area: RGB(114,114,114) padding. Red dashed outline: resized image boundary.
              </p>
            </figure>
          </section>

          <section aria-label="Letterbox geometry" style={{ marginTop: 24 }}>
            <h2>Geometry</h2>
            <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content' }}>
              <dt>Original Width</dt><dd>{metrics.originalWidth}</dd>
              <dt>Original Height</dt><dd>{metrics.originalHeight}</dd>
              <dt>Resized Width</dt><dd>{metrics.resizedWidth}</dd>
              <dt>Resized Height</dt><dd>{metrics.resizedHeight}</dd>
              <dt>Scale</dt><dd>{metrics.scale}</dd>
              <dt>PadX</dt><dd>{metrics.padX}</dd>
              <dt>PadY</dt><dd>{metrics.padY}</dd>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}
