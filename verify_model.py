from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort


MODEL_PATH = Path("ai/models/yolo/best.onnx")
VALID_IMAGES_DIR = Path("ai/datasets/valid/images")
OUTPUT_PATH = Path("verify_result.jpg")
IMAGE_SIZE = 640
SCORE_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
CLASS_NAMES = ("license plate", "wheel")


def letterbox(image: np.ndarray, new_shape: int = IMAGE_SIZE) -> tuple[np.ndarray, float, tuple[float, float]]:
    height, width = image.shape[:2]
    scale = min(new_shape / height, new_shape / width)
    resized_width = round(width * scale)
    resized_height = round(height * scale)

    pad_width = new_shape - resized_width
    pad_height = new_shape - resized_height
    pad_left = pad_width / 2
    pad_top = pad_height / 2

    if (width, height) != (resized_width, resized_height):
        image = cv2.resize(image, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)

    top = round(pad_top - 0.1)
    bottom = round(pad_top + 0.1)
    left = round(pad_left - 0.1)
    right = round(pad_left + 0.1)

    image = cv2.copyMakeBorder(
        image,
        top,
        bottom,
        left,
        right,
        cv2.BORDER_CONSTANT,
        value=(114, 114, 114),
    )

    return image, scale, (pad_left, pad_top)


def preprocess(image_bgr: np.ndarray) -> tuple[np.ndarray, float, tuple[float, float]]:
    letterboxed, scale, pad = letterbox(image_bgr)
    image_rgb = cv2.cvtColor(letterboxed, cv2.COLOR_BGR2RGB)
    tensor = image_rgb.astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[None]
    return tensor, scale, pad


def xywh_to_xyxy(box: np.ndarray) -> np.ndarray:
    x, y, w, h = box
    return np.array(
        [
            x - w / 2,
            y - h / 2,
            x + w / 2,
            y + h / 2,
        ],
        dtype=np.float32,
    )


def iou(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    x1 = np.maximum(box[0], boxes[:, 0])
    y1 = np.maximum(box[1], boxes[:, 1])
    x2 = np.minimum(box[2], boxes[:, 2])
    y2 = np.minimum(box[3], boxes[:, 3])

    intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    box_area = np.maximum(0, box[2] - box[0]) * np.maximum(0, box[3] - box[1])
    boxes_area = np.maximum(0, boxes[:, 2] - boxes[:, 0]) * np.maximum(0, boxes[:, 3] - boxes[:, 1])

    return intersection / (box_area + boxes_area - intersection + 1e-6)


def nms(boxes: np.ndarray, scores: np.ndarray, threshold: float = IOU_THRESHOLD) -> list[int]:
    order = scores.argsort()[::-1]
    keep: list[int] = []

    while order.size > 0:
        current = order[0]
        keep.append(int(current))

        if order.size == 1:
            break

        remaining = order[1:]
        overlaps = iou(boxes[current], boxes[remaining])
        order = remaining[overlaps <= threshold]

    return keep


def decode(
    output: np.ndarray,
    scale: float,
    pad: tuple[float, float],
    original_shape: tuple[int, int],
) -> tuple[list[dict[str, object]], float, float, int]:
    predictions = output[0]

    if predictions.shape[0] < predictions.shape[1]:
        predictions = predictions.T

    boxes_xywh = predictions[:, :4]
    class_scores = predictions[:, 4:]
    class_ids = np.argmax(class_scores, axis=1)
    confidences = class_scores[np.arange(class_scores.shape[0]), class_ids]

    max_class0 = float(class_scores[:, 0].max())
    max_class1 = float(class_scores[:, 1].max())
    num_over_threshold = int(np.sum(confidences >= SCORE_THRESHOLD))

    mask = confidences >= SCORE_THRESHOLD
    boxes_xywh = boxes_xywh[mask]
    confidences = confidences[mask]
    class_ids = class_ids[mask]

    if boxes_xywh.size == 0:
        return [], max_class0, max_class1, num_over_threshold

    boxes_xyxy = np.array([xywh_to_xyxy(box) for box in boxes_xywh], dtype=np.float32)
    keep = nms(boxes_xyxy, confidences)

    pad_x, pad_y = pad
    original_height, original_width = original_shape
    detections: list[dict[str, object]] = []

    for index in keep:
        box = boxes_xyxy[index].copy()
        box[[0, 2]] = (box[[0, 2]] - pad_x) / scale
        box[[1, 3]] = (box[[1, 3]] - pad_y) / scale
        box[[0, 2]] = np.clip(box[[0, 2]], 0, original_width)
        box[[1, 3]] = np.clip(box[[1, 3]], 0, original_height)

        detections.append(
            {
                "box": box,
                "score": float(confidences[index]),
                "class_id": int(class_ids[index]),
            }
        )

    return detections, max_class0, max_class1, num_over_threshold


def draw_detections(image: np.ndarray, detections: list[dict[str, object]]) -> np.ndarray:
    result = image.copy()

    for detection in detections:
        box = detection["box"]
        score = detection["score"]
        class_id = detection["class_id"]
        x1, y1, x2, y2 = [int(round(value)) for value in box]
        color = (0, 255, 0) if class_id == 0 else (255, 0, 0)
        label = f"{CLASS_NAMES[class_id]} {score:.2f}"

        cv2.rectangle(result, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            result,
            label,
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
            cv2.LINE_AA,
        )

    return result


def main() -> None:
    image_paths = sorted(
        path
        for path in VALID_IMAGES_DIR.iterdir()
        if path.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )

    if not image_paths:
        raise FileNotFoundError(f"No validation images found in {VALID_IMAGES_DIR}")

    image_path = image_paths[0]
    image = cv2.imread(str(image_path))

    if image is None:
        raise RuntimeError(f"Could not load image: {image_path}")

    tensor, scale, pad = preprocess(image)

    session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: tensor})[0]

    detections, max_class0, max_class1, num_over_threshold = decode(
        output,
        scale,
        pad,
        image.shape[:2],
    )

    result = draw_detections(image, detections)
    cv2.imwrite(str(OUTPUT_PATH), result)

    print(f"image: {image_path}")
    print(f"output shape: {output.shape}")
    print(f"max class0 score: {max_class0}")
    print(f"max class1 score: {max_class1}")
    print(f"number of predictions >= {SCORE_THRESHOLD}: {num_over_threshold}")
    print(f"saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
