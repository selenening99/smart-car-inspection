import { datasetDetectorSessionProvider } from './DetectorSessionProvider';
import { recoverPipelineDetections, runDetectionPipeline } from './DetectionPipeline';
import { FrameEvaluator } from './FrameEvaluator';
import { loadDatasetImage } from './ImageLoader';
import { buildCalibrationObservation, selectHighestConfidenceDetection } from './ObservationBuilder';
import type { CalibrationObservation } from './DatasetLayoutAnalyzer';

export interface DatasetRejectionCounts {
  plateMissing: number;
  wheelMissing: number;
  lowConfidence: number;
  poorQuality: number;
  unreadable: number;
}

export interface DatasetProcessorOptions {
  confidenceThreshold: number;
  qualityThreshold: number;
}

export interface DatasetProgress {
  current: number;
  total: number;
  imageName: string;
}

export interface DatasetProcessingResult {
  observations: CalibrationObservation[];
  rejections: DatasetRejectionCounts;
}

function emptyRejectionCounts(): DatasetRejectionCounts {
  return { plateMissing: 0, wheelMissing: 0, lowConfidence: 0, poorQuality: 0, unreadable: 0 };
}

/**
 * Orchestrates reusable dataset stages. Rejection order intentionally matches
 * the original pipeline and this module contains no image, quality, model, or
 * observation-building implementation details.
 */
export async function processDataset(
  files: File[],
  options: DatasetProcessorOptions,
  onProgress?: (progress: DatasetProgress) => void,
): Promise<DatasetProcessingResult> {
  const session = await datasetDetectorSessionProvider.getSession();
  const frameEvaluator = new FrameEvaluator();
  const observations: CalibrationObservation[] = [];
  const rejections = emptyRejectionCounts();

  for (const [index, file] of files.entries()) {
    onProgress?.({ current: index + 1, total: files.length, imageName: file.name });
    const totalStartedAt = performance.now();

    try {
      const loadedImage = await loadDatasetImage(file);
      const evaluation = frameEvaluator.evaluate(loadedImage.image);
      const { frameQuality, qualityScore } = evaluation;

      if (
        frameQuality.isBlurred
        || frameQuality.isOverExposed
        || frameQuality.isUnderExposed
        || qualityScore < options.qualityThreshold
      ) {
        rejections.poorQuality += 1;
        continue;
      }

      const pipeline = await runDetectionPipeline(
        loadedImage.image,
        loadedImage.width,
        loadedImage.height,
        session,
      );
      const rawPlate = selectHighestConfidenceDetection(pipeline.rawBoxes, 0);
      const rawWheel = selectHighestConfidenceDetection(pipeline.rawBoxes, 1);

      if (rawPlate === undefined) {
        rejections.plateMissing += 1;
        continue;
      }

      if (rawWheel === undefined) {
        rejections.wheelMissing += 1;
        continue;
      }

      if (rawPlate.confidence < options.confidenceThreshold || rawWheel.confidence < options.confidenceThreshold) {
        rejections.lowConfidence += 1;
        continue;
      }

      const recovered = recoverPipelineDetections(
        pipeline,
        options.confidenceThreshold,
        loadedImage.width,
        loadedImage.height,
      );
      const observation = buildCalibrationObservation({
        imageName: file.name,
        imageWidth: loadedImage.width,
        imageHeight: loadedImage.height,
        detections: recovered.detections,
        qualityScore,
        metrics: {
          qualityTime: evaluation.qualityTime,
          inferenceTime: pipeline.inferenceTime,
          postprocessTime: recovered.postprocessTime,
          totalTime: performance.now() - totalStartedAt,
        },
      });

      if (observation === undefined) {
        if (selectHighestConfidenceDetection(recovered.detections, 0) === undefined) {
          rejections.plateMissing += 1;
        } else {
          rejections.wheelMissing += 1;
        }
        continue;
      }

      observations.push(observation);
    } catch {
      rejections.unreadable += 1;
    }
  }

  return { observations, rejections };
}
