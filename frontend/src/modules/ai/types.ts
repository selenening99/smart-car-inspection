export interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;

  confidence: number;

  classId: number;

  label: string;
}