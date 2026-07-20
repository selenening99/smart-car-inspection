import type * as ort from 'onnxruntime-web';

/**
 * One model row after extracting xywh, its highest-scoring class, and that
 * class's raw score. `xywh` remains in the model-output coordinate system.
 */
export interface RawDetection {

    cx:number;

    cy:number;

    width:number;

    height:number;

    classId:number;

    confidence:number;

}

export interface DecoderResult {
    outputShape: readonly number[];
    detections: RawDetection[];
}

/**
 * Translates only the prediction-layout and class-score portion of
 * `run_onnx()` in `ai/scripts/verify_export.py`.
 *
 * It does not filter confidences, convert xywh to xyxy, run NMS, or recover
 * original-image coordinates.
 */
export function decode(output: ort.Tensor): DecoderResult {
  // Python: predictions = output[0]
  // The first batch occupies the first `rows * columns` elements in ONNX
  // Runtime's contiguous tensor buffer.
  const rowsBeforeTranspose = output.dims[1];
  const columnsBeforeTranspose = output.dims[2];

  if (rowsBeforeTranspose === undefined || columnsBeforeTranspose === undefined) {
    throw new Error('Decoder expects an ONNX output tensor with shape [batch, rows, columns].');
  }

  const output0 = output.data as Float32Array;
  let predictions = output0.slice(0, rowsBeforeTranspose * columnsBeforeTranspose);
  let predictionRows = rowsBeforeTranspose;
  let predictionColumns = columnsBeforeTranspose;

  // Python: if predictions.shape[0] < predictions.shape[1]: predictions = predictions.T
  if (predictionRows < predictionColumns) {
    const transposed = new Float32Array(predictionRows * predictionColumns);

    for (let row = 0; row < predictionRows; row += 1) {
      for (let column = 0; column < predictionColumns; column += 1) {
        transposed[column * predictionRows + row] = predictions[row * predictionColumns + column];
      }
    }

    predictions = transposed;
    predictionRows = columnsBeforeTranspose;
    predictionColumns = rowsBeforeTranspose;
  }

  // Python: boxes_xywh = predictions[:, :4]
  // Python: class_scores = predictions[:, 4:]
  // Python: class_ids = np.argmax(class_scores, axis=1)
  // Python: confidences = class_scores[np.arange(...), class_ids]
  const detections: RawDetection[] = [];

  for (let row = 0; row < predictionRows; row += 1) {
    const offset = row * predictionColumns;
    const cx = predictions[offset];
    const cy = predictions[offset + 1];
    const width = predictions[offset + 2];
    const height = predictions[offset + 3];

    let classId = 0;
    let confidence = predictions[offset + 4];

    for (let column = 5; column < predictionColumns; column += 1) {
      const classScore = predictions[offset + column];

      // `>` preserves NumPy argmax's first-index behavior when scores tie.
      if (classScore > confidence) {
        classId = column - 4;
        confidence = classScore;
      }
    }

    detections.push({ cx, cy, width, height, classId, confidence });
  }

  return {
    outputShape: output.dims,
    detections,
  };
}
