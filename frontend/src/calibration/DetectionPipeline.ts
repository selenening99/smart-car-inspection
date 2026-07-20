import type * as ort from 'onnxruntime-web';
import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import { recoverOriginalCoordinates } from '../ai/postprocess/CoordinateMapper';
import { decode, type RawDetection } from '../ai/postprocess/Decoder';
import { classWiseNMS } from '../ai/postprocess/NMS';
import { runDetector } from '../ai/detector/Detector';
import { letterbox, type LetterboxResult } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

export interface RawDetectionPipelineResult {
  letterboxed: LetterboxResult;
  rawDetections: RawDetection[];
  rawBoxes: BoxDetection[];
  inferenceTime: number;
  initialPostprocessTime: number;
}

export interface RecoveredDetectionPipelineResult {
  detections: BoxDetection[];
  postprocessTime: number;
}

const IOU_THRESHOLD = 0.45;

/**
 * Runs letterboxing, tensor preparation, ONNX inference, decoding, and the
 * initial xywh conversion. Its raw boxes intentionally precede confidence
 * filtering and NMS because the existing rejection policy checks them first.
 */
export async function runDetectionPipeline(
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  session: ort.InferenceSession,
): Promise<RawDetectionPipelineResult> {
  const inferenceStartedAt = performance.now();
  const letterboxed = letterbox(image, imageWidth, imageHeight);
  const tensor = preprocess(letterboxed);
  const output = await runDetector(session, tensor);
  const inferenceTime = performance.now() - inferenceStartedAt;

  const postprocessStartedAt = performance.now();
  const decoded = decode(output);
  const rawDetections = decoded.detections;
  const rawBoxes = convertXYWHToXYXY(rawDetections);

  return {
    letterboxed,
    rawDetections,
    rawBoxes,
    inferenceTime,
    initialPostprocessTime: performance.now() - postprocessStartedAt,
  };
}

/**
 * Applies the existing confidence filter, class-wise NMS, and coordinate
 * recovery only after raw detection checks have passed.
 */
export function recoverPipelineDetections(
  pipeline: RawDetectionPipelineResult,
  confidenceThreshold: number,
  imageWidth: number,
  imageHeight: number,
): RecoveredDetectionPipelineResult {
  const postprocessStartedAt = performance.now();
  const confidenceFiltered = filterByConfidence(pipeline.rawDetections, confidenceThreshold);
  const converted = convertXYWHToXYXY(confidenceFiltered);
  const selected = classWiseNMS(converted, IOU_THRESHOLD);
  const detections = recoverOriginalCoordinates(
    selected,
    pipeline.letterboxed.scale,
    pipeline.letterboxed.padX,
    pipeline.letterboxed.padY,
    { width: imageWidth, height: imageHeight },
  );

  return {
    detections,
    postprocessTime: pipeline.initialPostprocessTime + performance.now() - postprocessStartedAt,
  };
}
