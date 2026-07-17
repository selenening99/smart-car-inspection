from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

try:
    import onnxruntime as ort
except ImportError as exc:
    raise SystemExit("Missing dependency: install onnxruntime to run this script.") from exc

try:
    from ultralytics import YOLO
except ImportError as exc:
    raise SystemExit("Missing dependency: install ultralytics to run this script.") from exc


REPO_ROOT = Path(__file__).resolve().parents[2]
PT_MODEL_PATH = REPO_ROOT / "ai/models/yolo/best.pt"
ONNX_MODEL_PATH = REPO_ROOT / "ai/models/yolo/best.onnx"
VALID_IMAGES_DIR = REPO_ROOT / "ai/datasets/valid/images"

IMAGE_SIZE = 640
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
CLASS_NAMES = ("license plate", "wheel")


def first_validation_image() -> Path:
    image_paths = sorted(
        path
        for path in VALID_IMAGES_DIR.iterdir()
        if path.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )

    if not image_paths:
        raise FileNotFoundError(f"No jpg/png validation image found in {VALID_IMAGES_DIR}")

    return image_paths[0]


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


def preprocess_for_onnx(image_bgr: np.ndarray) -> tuple[np.ndarray, float, tuple[float, float]]:
    letterboxed, scale, pad = letterbox(image_bgr)
    image_rgb = cv2.cvtColor(letterboxed, cv2.COLOR_BGR2RGB)
    tensor = image_rgb.astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[None]
    return tensor, scale, pad


def xywh_to_xyxy(boxes: np.ndarray) -> np.ndarray:
    xyxy = np.empty_like(boxes, dtype=np.float32)
    xyxy[:, 0] = boxes[:, 0] - boxes[:, 2] / 2
    xyxy[:, 1] = boxes[:, 1] - boxes[:, 3] / 2
    xyxy[:, 2] = boxes[:, 0] + boxes[:, 2] / 2
    xyxy[:, 3] = boxes[:, 1] + boxes[:, 3] / 2
    return xyxy


def box_iou(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    x1 = np.maximum(box[0], boxes[:, 0])
    y1 = np.maximum(box[1], boxes[:, 1])
    x2 = np.minimum(box[2], boxes[:, 2])
    y2 = np.minimum(box[3], boxes[:, 3])

    intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    box_area = np.maximum(0, box[2] - box[0]) * np.maximum(0, box[3] - box[1])
    boxes_area = np.maximum(0, boxes[:, 2] - boxes[:, 0]) * np.maximum(0, boxes[:, 3] - boxes[:, 1])

    return intersection / (box_area + boxes_area - intersection + 1e-6)


def class_wise_nms(boxes: np.ndarray, scores: np.ndarray, class_ids: np.ndarray) -> list[int]:
    keep: list[int] = []

    for class_id in np.unique(class_ids):
        class_indices = np.where(class_ids == class_id)[0]
        order = class_indices[np.argsort(scores[class_indices])[::-1]]

        while order.size > 0:
            current = order[0]
            keep.append(int(current))

            if order.size == 1:
                break

            remaining = order[1:]
            overlaps = box_iou(boxes[current], boxes[remaining])
            order = remaining[overlaps <= IOU_THRESHOLD]

    keep.sort(key=lambda index: float(scores[index]), reverse=True)
    return keep


def run_pt(image_path: Path) -> list[dict[str, object]]:
    model = YOLO(str(PT_MODEL_PATH))
    result = model.predict(
        source=str(image_path),
        imgsz=IMAGE_SIZE,
        conf=CONF_THRESHOLD,
        iou=IOU_THRESHOLD,
        verbose=False,
    )[0]

    detections: list[dict[str, object]] = []
    boxes = result.boxes

    if boxes is None or len(boxes) == 0:
        return detections

    xyxy = boxes.xyxy.cpu().numpy()
    confidences = boxes.conf.cpu().numpy()
    class_ids = boxes.cls.cpu().numpy().astype(int)

    for box, confidence, class_id in zip(xyxy, confidences, class_ids):
        detections.append(
            {
                "class_id": int(class_id),
                "confidence": float(confidence),
                "bbox": box.astype(float),
            }
        )

    detections.sort(key=lambda item: float(item["confidence"]), reverse=True)
    return detections


def run_onnx(image_bgr: np.ndarray) -> list[dict[str, object]]:
    tensor, scale, pad = preprocess_for_onnx(image_bgr)
    session = ort.InferenceSession(str(ONNX_MODEL_PATH), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: tensor})[0]

    predictions = output[0]
    if predictions.shape[0] < predictions.shape[1]:
        predictions = predictions.T

    boxes_xywh = predictions[:, :4]
    class_scores = predictions[:, 4:]
    class_ids = np.argmax(class_scores, axis=1)
    confidences = class_scores[np.arange(class_scores.shape[0]), class_ids]

    mask = confidences >= CONF_THRESHOLD
    boxes_xywh = boxes_xywh[mask]
    confidences = confidences[mask]
    class_ids = class_ids[mask]

    if boxes_xywh.size == 0:
        return []

    boxes_xyxy = xywh_to_xyxy(boxes_xywh)
    keep = class_wise_nms(boxes_xyxy, confidences, class_ids)

    pad_x, pad_y = pad
    original_height, original_width = image_bgr.shape[:2]
    detections: list[dict[str, object]] = []

    for index in keep:
        box = boxes_xyxy[index].astype(np.float32).copy()
        box[[0, 2]] = (box[[0, 2]] - pad_x) / scale
        box[[1, 3]] = (box[[1, 3]] - pad_y) / scale
        box[[0, 2]] = np.clip(box[[0, 2]], 0, original_width)
        box[[1, 3]] = np.clip(box[[1, 3]], 0, original_height)

        detections.append(
            {
                "class_id": int(class_ids[index]),
                "confidence": float(confidences[index]),
                "bbox": box.astype(float),
            }
        )

    detections.sort(key=lambda item: float(item["confidence"]), reverse=True)
    return detections


def format_bbox(bbox: np.ndarray) -> str:
    return "[" + ", ".join(f"{value:.2f}" for value in bbox) + "]"


def print_result(title: str, detections: list[dict[str, object]]) -> None:
    print("========================")
    print(title)
    print("========================")
    print(f"number of detections: {len(detections)}")
    print("top 10 detections")

    if not detections:
        print("(none)")
        return

    for index, detection in enumerate(detections[:10], start=1):
        class_id = int(detection["class_id"])
        class_name = CLASS_NAMES[class_id] if 0 <= class_id < len(CLASS_NAMES) else str(class_id)
        confidence = float(detection["confidence"])
        bbox = np.asarray(detection["bbox"], dtype=float)

        print(f"{index}.")
        print(f"class: {class_id} ({class_name})")
        print(f"confidence: {confidence:.6f}")
        print(f"bbox: {format_bbox(bbox)}")


def detection_iou(a: dict[str, object], b: dict[str, object]) -> float:
    box_a = np.asarray(a["bbox"], dtype=np.float32)
    box_b = np.asarray(b["bbox"], dtype=np.float32)[None, :]
    return float(box_iou(box_a, box_b)[0])


def print_possible_causes(pt_detections: list[dict[str, object]], onnx_detections: list[dict[str, object]]) -> None:
    issues: list[str] = []

    if len(pt_detections) != len(onnx_detections):
        issues.append("Detection counts differ after confidence filtering and NMS.")

    for index, (pt_det, onnx_det) in enumerate(zip(pt_detections[:10], onnx_detections[:10]), start=1):
        pt_class = int(pt_det["class_id"])
        onnx_class = int(onnx_det["class_id"])
        conf_delta = abs(float(pt_det["confidence"]) - float(onnx_det["confidence"]))
        iou = detection_iou(pt_det, onnx_det)

        if pt_class != onnx_class:
            issues.append(f"Top-{index} class differs: PT={pt_class}, ONNX={onnx_class}.")

        if conf_delta > 0.05:
            issues.append(f"Top-{index} confidence differs by {conf_delta:.4f}.")

        if iou < 0.85:
            issues.append(f"Top-{index} bbox IoU is low: {iou:.4f}.")

    if not issues:
        print("Outputs are closely aligned.")
        return

    print("========================")
    print("POSSIBLE CAUSES")
    print("========================")
    for issue in issues:
        print(f"- {issue}")

    print("- PT prediction uses Ultralytics internal preprocessing/NMS; ONNX uses this script's letterbox and NMS.")
    print("- A preprocessing mismatch can come from RGB/BGR order, resize vs letterbox, normalization, or tensor layout.")
    print("- A postprocessing mismatch can come from confidence threshold, class-wise vs agnostic NMS, IoU threshold, or box rescaling.")
    print("- Small numerical differences are expected between PyTorch and ONNX Runtime.")


def main() -> None:
    image_path = first_validation_image()
    image_bgr = cv2.imread(str(image_path))

    if image_bgr is None:
        raise RuntimeError(f"Could not read image: {image_path}")

    print(f"image: {image_path}")
    print()

    pt_detections = run_pt(image_path)
    onnx_detections = run_onnx(image_bgr)

    print_result("PT RESULT", pt_detections)
    print()
    print_result("ONNX RESULT", onnx_detections)
    print()
    print_possible_causes(pt_detections, onnx_detections)


if __name__ == "__main__":
    main()
