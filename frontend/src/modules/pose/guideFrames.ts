import type { GuideFrame, VehiclePose } from "./types";

export const GUIDE_FRAMES: Record<Exclude<VehiclePose, "unknown">, GuideFrame> = {
  front_left: {
    pose: "front_left",
    sourceImage:
      "ai/datasets/train/images/train5_jpeg.rf.559add03b0db81a5b09eeb39a7a95a2b.jpg",
    sourceLabel:
      "ai/datasets/train/labels/train5_jpeg.rf.559add03b0db81a5b09eeb39a7a95a2b.txt",
    boxes: [
      {
        classId: 0,
        label: "license_plate",
        x: 0.8291666666666666,
        y: 0.6375,
        width: 0.14861111111111103,
        height: 0.05937500000000007,
      },
      {
        classId: 1,
        label: "wheel",
        x: 0.2958333333333333,
        y: 0.56875,
        width: 0.09861111111111115,
        height: 0.14765625000000004,
      },
    ],
  },
  front_right: {
    pose: "front_right",
    sourceImage:
      "ai/datasets/train/images/train2_jpeg.rf.681f37a66e9d19d0a304327b340f52bd.jpg",
    sourceLabel:
      "ai/datasets/train/labels/train2_jpeg.rf.681f37a66e9d19d0a304327b340f52bd.txt",
    boxes: [
      {
        classId: 0,
        label: "license_plate",
        x: 0.15101385753420468,
        y: 0.5280661798310354,
        width: 0.11025157626047435,
        height: 0.15899436935520972,
      },
      {
        classId: 1,
        label: "wheel",
        x: 0.5904858089135832,
        y: 0.46473977338437145,
        width: 0.14205276986231152,
        height: 0.4053719514200237,
      },
    ],
  },
  rear_left: {
    pose: "rear_left",
    sourceImage:
      "ai/datasets/train/images/train1_jpeg.rf.05617c58d3a2f0b90c4e643142aeeac5.jpg",
    sourceLabel:
      "ai/datasets/train/labels/train1_jpeg.rf.05617c58d3a2f0b90c4e643142aeeac5.txt",
    boxes: [
      {
        classId: 0,
        label: "license_plate",
        x: 0.7235817576263828,
        y: 0.4222051946926146,
        width: 0.06681250024040197,
        height: 0.13177978775207594,
      },
      {
        classId: 1,
        label: "wheel",
        x: 0.27967488974154164,
        y: 0.5773114831543145,
        width: 0.12520804869291235,
        height: 0.3482921697206198,
      },
    ],
  },
  rear_right: {
    pose: "rear_right",
    sourceImage:
      "ai/datasets/train/images/train4_jpeg.rf.429185710c5442598353051974e7683c.jpg",
    sourceLabel:
      "ai/datasets/train/labels/train4_jpeg.rf.429185710c5442598353051974e7683c.txt",
    boxes: [
      {
        classId: 0,
        label: "license_plate",
        x: 0.07481964274705599,
        y: 0.531715311951772,
        width: 0.155317047278209,
        height: 0.05733399486018509,
      },
      {
        classId: 1,
        label: "wheel",
        x: 0.6652379833811735,
        y: 0.599076776451285,
        width: 0.10751808832951715,
        height: 0.15120185133505493,
      },
    ],
  },
};
