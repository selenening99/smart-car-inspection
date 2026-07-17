import * as ort from "onnxruntime-web";
import { CLASS_NAMES } from "./types";
import type { Detection } from "./types";

export function decoder(
  output: Record<string, ort.Tensor>,
  imageSize = 640,
  scoreThreshold = 0
): Detection[] {
  const tensor = output.output0;

  if (!tensor) {
    return [];
  }

  const data = tensor.data as Float32Array;
  const dims = tensor.dims;

  if (!data || !dims || dims.length < 3) {
    return [];
  }

  const [, dim1, dim2] = dims;
  let channelsFirst = false;
  let numPredictions = 0;
  let numChannels = 0;

  if (dim1 >= 6) {
    channelsFirst = true;
    numChannels = dim1;
    numPredictions = dim2;
  } else if (dim2 >= 6) {
    channelsFirst = false;
    numChannels = dim2;
    numPredictions = dim1;
  } else {
    return [];
  }

  const numClasses = numChannels - 4;
  console.log("dims:", dims);
  console.log("numChannels:", numChannels);
  console.log("numClasses:", numClasses);
  const detections: Detection[] = [];
  let maxClass0 = -Infinity;
  let maxClass0Index = -1;
  let maxClass1 = -Infinity;
  let maxClass1Index = -1;
  let maxConfidence = -Infinity;
  let maxConfidenceIndex = -1;

  for (let i = 0; i < numPredictions; i += 1) {
    if (i === 0) {
      console.log("Prediction 0");

      for (let c = 0; c < numChannels; c++) {
        const value = channelsFirst
          ? data[c * numPredictions]
          : data[c];

        console.log(`channel ${c}:`, value);
      }
    }
    let xc: number;
    let yc: number;
    let w: number;
    let h: number;

    if (channelsFirst) {
      xc = data[0 * numPredictions + i];
      yc = data[1 * numPredictions + i];
      w = data[2 * numPredictions + i];
      h = data[3 * numPredictions + i];
    } else {
      const base = i * numChannels;
      xc = data[base + 0];
      yc = data[base + 1];
      w = data[base + 2];
      h = data[base + 3];
    }

    let confidence = -Infinity;
    let classId = 0;

    for (let classIndex = 0; classIndex < numClasses; classIndex += 1) {
      const score = channelsFirst
        ? data[(4 + classIndex) * numPredictions + i]
        : data[i * numChannels + 4 + classIndex];

      if (classIndex === 0 && score > maxClass0) {
        maxClass0 = score;
        maxClass0Index = i;
      }

      if (classIndex === 1 && score > maxClass1) {
        maxClass1 = score;
        maxClass1Index = i;
      }

      if (score > confidence) {
        confidence = score;
        classId = classIndex;
      }
    }

    if (confidence > maxConfidence) {
      maxConfidence = confidence;
      maxConfidenceIndex = i;
    }

    if (confidence < scoreThreshold) {
      continue;
    }

    const toPixel = (value: number) =>
      Math.abs(value) <= 1 ? value * imageSize : value;

    const centerX = toPixel(xc);
    const centerY = toPixel(yc);
    const width = toPixel(w);
    const height = toPixel(h);

    const x = centerX - width / 2;
    const y = centerY - height / 2;

    const label = CLASS_NAMES[classId] ?? String(classId);

    detections.push({
      x,
      y,
      width,
      height,
      confidence,
      classId,
      label,
    });
  }

  console.log("max class0:", maxClass0, "index:", maxClass0Index);
  console.log("max class1:", maxClass1, "index:", maxClass1Index);
  console.log("max confidence:", maxConfidence);
  console.log("best prediction index:", maxConfidenceIndex);
  console.log("Decoded:", detections.length);
  return detections;
}
