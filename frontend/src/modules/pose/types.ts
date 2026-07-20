export type VehiclePose =
  | "front_left"
  | "front_right"
  | "rear_left"
  | "rear_right"
  | "unknown";

export interface PoseResult {
  pose: VehiclePose;
  confidence: number;
}

export interface GuideFrameBox {
  classId: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GuideFrame {
  pose: Exclude<VehiclePose, "unknown">;
  sourceImage: string;
  sourceLabel: string;
  boxes: GuideFrameBox[];
}
