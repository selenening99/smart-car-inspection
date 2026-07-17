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
