import { ValidationReason } from './FrameValidator';

export interface GuideHint {
  title: string;
  message: string;
  priority: number;
}

const HINT_MAP: Record<ValidationReason, GuideHint> = {
  [ValidationReason.NoLicensePlate]: {
    title: '車牌',
    message: '請將車牌放入畫面',
    priority: 100,
  },
  [ValidationReason.MultipleLicensePlates]: {
    title: '車牌',
    message: '請將車牌放入畫面',
    priority: 100,
  },
  [ValidationReason.NotEnoughWheels]: {
    title: '拍攝角度',
    message: '請調整拍攝角度',
    priority: 90,
  },
  [ValidationReason.MoveLeft]: {
    title: '位置',
    message: '請往左移',
    priority: 70,
  },
  [ValidationReason.MoveRight]: {
    title: '位置',
    message: '請往右移',
    priority: 70,
  },
  [ValidationReason.MoveCloser]: {
    title: '距離',
    message: '請靠近車輛',
    priority: 80,
  },
  [ValidationReason.MoveFarther]: {
    title: '距離',
    message: '請後退',
    priority: 80,
  },
};

/**
 * Converts frame-validation reasons into ordered, user-facing capture hints.
 * Higher priority values are returned first.
 */
export function generateHints(reasons: ValidationReason[]): GuideHint[] {
  return reasons
    .map((reason) => HINT_MAP[reason])
    .filter((hint): hint is GuideHint => hint !== undefined)
    .sort((a, b) => b.priority - a.priority);
}
