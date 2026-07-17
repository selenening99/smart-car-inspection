export interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;

  confidence: number;

  classId: number;

  label: string;
}

export const CLASS_NAMES = [
  "license plate",
  "wheel",
] as const;

export type ClassName = (typeof CLASS_NAMES)[number];