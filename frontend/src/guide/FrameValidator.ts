// @ts-nocheck

import type { BoxDetection } from '../ai/postprocess/BoxConverter';

export enum ValidationReason {
  NoLicensePlate = 'No license plate detected',
  MultipleLicensePlates = 'Exactly one license plate is required',
  NotEnoughWheels = 'Not enough wheels detected',
  MoveLeft = 'Move left',
  MoveRight = 'Move right',
  MoveCloser = 'Move closer',
  MoveFarther = 'Move farther',
}

export interface ValidationResult {
  valid: boolean;
  reasons: ValidationReason[];
}

const LICENSE_PLATE_CLASS_ID = 0;
const WHEEL_CLASS_ID = 1;

function getBoundingRect(detections: BoxDetection[]) {
  const left = Math.min(...detections.map((detection) => detection.x1));
  const top = Math.min(...detections.map((detection) => detection.y1));
  const right = Math.max(...detections.map((detection) => detection.x2));
  const bottom = Math.max(...detections.map((detection) => detection.y2));
  const width = right - left;
  const height = bottom - top;

  return { left, top, right, bottom, width, height };
}

/**
 * Validates the minimum vehicle framing rules from the final recovered boxes.
 * Class ID 0 is the license plate and class ID 1 is the wheel, matching the
 * class order in `verify_export.py`.
 */
export function validateFrame(
  detections: BoxDetection[],
  imageWidth: number,
  imageHeight: number,
): ValidationResult {
  // The MVP rules have no vertical framing threshold yet; retain the required
  // image height input for the validator contract.
  void imageHeight;

  const reasons: ValidationReason[] = [];
  const licensePlates = detections.filter((detection) => detection.classId === LICENSE_PLATE_CLASS_ID);
  const wheels = detections.filter((detection) => detection.classId === WHEEL_CLASS_ID);

  if (licensePlates.length === 0) {
    reasons.push(ValidationReason.NoLicensePlate);
  } else if (licensePlates.length !== 1) {
    reasons.push(ValidationReason.MultipleLicensePlates);
  }

  if (wheels.length < 2) {
    reasons.push(ValidationReason.NotEnoughWheels);
  }

  if (licensePlates.length === 1) {
    const licensePlate = licensePlates[0];
    const licensePlateCenter = (licensePlate.x1 + licensePlate.x2) / 2;
    const middleLeft = imageWidth * 0.3;
    const middleRight = imageWidth * 0.7;

    if (licensePlateCenter < middleLeft) {
      reasons.push(ValidationReason.MoveRight);
    } else if (licensePlateCenter > middleRight) {
      reasons.push(ValidationReason.MoveLeft);
    }
  }

  if (detections.length > 0) {
    const boundingRect = getBoundingRect(detections);

    if (boundingRect.width < imageWidth * 0.4) {
      reasons.push(ValidationReason.MoveCloser);
    } else if (boundingWidth > imageWidth * 0.85) {
      reasons.push(ValidationReason.MoveFarther);
    }
  }

  return { valid: reasons.length === 0, reasons };
}
