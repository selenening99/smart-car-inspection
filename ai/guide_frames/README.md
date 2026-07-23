# Vehicle Pose Guide Frames

Coordinates are normalized bounding boxes converted from YOLO polygon labels.
Class `0` is `license_plate`; class `1` is `wheel`.

Annotated review images:

- `annotated/front_left.jpg`
- `annotated/front_right.jpg`
- `annotated/rear_left.jpg`
- `annotated/rear_right.jpg`

Frontend guide data:

- `frontend/src/modules/pose/guideFrames.ts`

## Sources

| Pose | Source image | Label |
| --- | --- | --- |
| front_left | `ai/datasets/train/images/train5_jpeg.rf.559add03b0db81a5b09eeb39a7a95a2b.jpg` | `ai/datasets/train/labels/train5_jpeg.rf.559add03b0db81a5b09eeb39a7a95a2b.txt` |
| front_right | `ai/datasets/train/images/train2_jpeg.rf.681f37a66e9d19d0a304327b340f52bd.jpg` | `ai/datasets/train/labels/train2_jpeg.rf.681f37a66e9d19d0a304327b340f52bd.txt` |
| rear_left | `ai/datasets/train/images/train1_jpeg.rf.05617c58d3a2f0b90c4e643142aeeac5.jpg` | `ai/datasets/train/labels/train1_jpeg.rf.05617c58d3a2f0b90c4e643142aeeac5.txt` |
| rear_right | `ai/datasets/train/images/train4_jpeg.rf.429185710c5442598353051974e7683c.jpg` | `ai/datasets/train/labels/train4_jpeg.rf.429185710c5442598353051974e7683c.txt` |
