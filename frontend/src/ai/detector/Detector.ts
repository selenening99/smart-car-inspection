import * as ort from 'onnxruntime-web';

/**
 * Runs an already loaded ONNX Runtime session with an already prepared tensor.
 *
 * The returned tensor is the model's first raw output. This module does not
 * decode boxes, inspect class scores, or apply non-maximum suppression.
 */
export async function runDetector(
  session: ort.InferenceSession,
  input: ort.Tensor,
): Promise<ort.Tensor> {
  const inputName = session.inputNames[0];
  if (inputName === undefined) {
    throw new Error('The ONNX session has no input at index 0.');
  }

  const outputs = await session.run({ [inputName]: input });
  const outputName = session.outputNames[0];
  if (outputName === undefined) {
    throw new Error('The ONNX session has no output at index 0.');
  }

  const output0 = outputs[outputName];
  if (output0 === undefined) {
    throw new Error('ONNX Runtime did not return output at index 0.');
  }

  return output0;
}
