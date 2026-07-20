import { useEffect, useState } from 'react';
import sampleImageUrl from '../assets/hero.png';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

interface TensorSummary {
  shape: readonly number[];
  min: number;
  max: number;
  mean: number;
  firstThirty: readonly number[];
}

interface PreprocessDebugState {
  letterboxedImageUrl: string;
  tensor: TensorSummary;
}

/**
 * Summarizes a float32 input tensor for inspection without performing any
 * inference or detector work.
 */
function summarizeTensor(values: Float32Array, shape: readonly number[]): TensorSummary {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }

  return {
    shape,
    min,
    max,
    mean: sum / values.length,
    firstThirty: Array.from(values.slice(0, 30)),
  };
}

/**
 * A standalone visual check for Letterbox → RGB → float32 → /255 → CHW → Tensor.
 * It loads one local image and intentionally never invokes YOLO or inference.
 */
export function PreprocessTest(): React.JSX.Element {
  const [state, setState] = useState<PreprocessDebugState>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    const image = new Image();

    image.onload = () => {
      const letterboxed = letterbox(image, image.naturalWidth, image.naturalHeight);
      const tensor = preprocess(letterboxed);

      if (!isMounted) {
        return;
      }

      setState({
        letterboxedImageUrl: letterboxed.canvas.toDataURL('image/png'),
        tensor: summarizeTensor(tensor.data as Float32Array, tensor.dims),
      });
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The preprocessing sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1400, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Preprocessing verification</h1>
      <p>This page verifies only Letterbox → RGB → float32 → /255 → CHW → Tensor.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      {state !== undefined && (
        <>
          <section style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <figure style={{ margin: 0 }}>
              <figcaption style={{ fontWeight: 700, marginBottom: 8 }}>Original image</figcaption>
              <img
                alt="Original preprocessing sample"
                src={sampleImageUrl}
                style={{ border: '1px solid #9ca3af', display: 'block', height: 'auto', maxWidth: '100%' }}
              />
            </figure>

            <figure style={{ margin: 0 }}>
              <figcaption style={{ fontWeight: 700, marginBottom: 8 }}>Letterboxed image</figcaption>
              <img
                alt="Letterboxed preprocessing sample"
                src={state.letterboxedImageUrl}
                style={{ border: '1px solid #9ca3af', display: 'block', height: 'auto', maxWidth: 640, width: '100%' }}
              />
            </figure>
          </section>

          <section aria-label="Tensor values" style={{ marginTop: 24 }}>
            <h2>Tensor</h2>
            <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content' }}>
              <dt>Tensor shape</dt><dd>[{state.tensor.shape.join(', ')}]</dd>
              <dt>Min</dt><dd>{state.tensor.min}</dd>
              <dt>Max</dt><dd>{state.tensor.max}</dd>
              <dt>Mean</dt><dd>{state.tensor.mean}</dd>
            </dl>
            <h3>First 30 float values</h3>
            <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
              {state.tensor.firstThirty.map((value) => value.toFixed(8)).join(', ')}
            </pre>
          </section>
        </>
      )}
    </main>
  );
}
