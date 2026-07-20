import { useEffect, useState } from 'react';
import * as ort from 'onnxruntime-web';
import sampleImageUrl from '../assets/hero.png';
import { runDetector } from '../ai/detector/Detector';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

interface DetectorOutputSummary {
  shape: readonly number[];
  min: number;
  max: number;
  firstTwenty: readonly number[];
}

/**
 * Summarizes a raw model tensor without interpreting any boxes or class scores.
 */
function summarizeOutput(output: ort.Tensor): DetectorOutputSummary {
  const values = output.data as Float32Array;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return {
    shape: output.dims,
    min,
    max,
    firstTwenty: Array.from(values.slice(0, 20)),
  };
}

/**
 * A standalone raw-output inspection page. It prepares one local sample image,
 * runs the ONNX model once, and displays only the first raw output tensor.
 */
export function DetectorTest(): React.JSX.Element {
  const [inputShape, setInputShape] = useState<readonly number[]>();
  const [output, setOutput] = useState<DetectorOutputSummary>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    const image = new Image();

    image.onload = () => {
      void (async () => {
        try {
          const letterboxed = letterbox(image, image.naturalWidth, image.naturalHeight);
          const input = preprocess(letterboxed);
          const session = await ort.InferenceSession.create('/best.onnx', {
            executionProviders: ['wasm'],
          });
          const output0 = await runDetector(session, input);

          if (isMounted) {
            setInputShape(input.dims);
            setOutput(summarizeOutput(output0));
          }
        } catch (caught) {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : 'The detector test failed.');
          }
        }
      })();
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The detector sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 900, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Raw detector output verification</h1>
      <p>This page displays raw ONNX Runtime output only. It does not decode or postprocess detections.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      {inputShape !== undefined && output !== undefined && (
        <section aria-label="Raw detector tensor">
          <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content' }}>
            <dt>Input Shape</dt><dd>[{inputShape.join(', ')}]</dd>
            <dt>Output Shape</dt><dd>[{output.shape.join(', ')}]</dd>
            <dt>Output Min</dt><dd>{output.min}</dd>
            <dt>Output Max</dt><dd>{output.max}</dd>
          </dl>
          <h2>First 20 float values</h2>
          <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
            {output.firstTwenty.map((value) => value.toFixed(8)).join(', ')}
          </pre>
        </section>
      )}
    </main>
  );
}
