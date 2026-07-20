export interface OverlayState {
  frameLeft: number;
  frameTop: number;
  frameWidth: number;
  frameHeight: number;
  centerX: number;
  centerY: number;
}

/** Computes the centered guide frame geometry for an image coordinate space. */
export function createOverlayState(
  imageWidth: number,
  imageHeight: number,
): OverlayState {
  const frameWidth = imageWidth * 0.7;
  const frameHeight = imageHeight * 0.7;
  const frameLeft = (imageWidth - frameWidth) / 2;
  const frameTop = (imageHeight - frameHeight) / 2;
  const centerX = imageWidth / 2;
  const centerY = imageHeight / 2;

  return { frameLeft, frameTop, frameWidth, frameHeight, centerX, centerY };
}
