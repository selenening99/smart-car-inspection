import type { GuidanceState } from '../guide/GuidanceEngine';

export const AutoCaptureState = {
  Idle: 'Idle',
  Guiding: 'Guiding',
  CountingDown: 'Counting Down',
  Capturing: 'Capturing',
  Completed: 'Completed',
} as const;

export type AutoCaptureState = (typeof AutoCaptureState)[keyof typeof AutoCaptureState];

export interface AutoCaptureCallbacks {
  onCountdown?: (remainingMilliseconds: number) => void;
  onCapture?: () => void;
  onCancel?: () => void;
  onCompleted?: () => void;
}

export interface AutoCaptureOptions extends AutoCaptureCallbacks {
  scoreThreshold?: number;
  stableDurationMilliseconds?: number;
}

/**
 * UI-independent gate for automatic capture. Call `update()` with each current
 * guidance state. Pass an explicit timestamp in tests to control the one-second
 * stability window without waiting for wall-clock time.
 */
export class AutoCaptureController {
  private readonly callbacks: AutoCaptureCallbacks;
  private readonly scoreThreshold: number;
  private readonly stableDurationMilliseconds: number;
  private countdownStartedAt: number | undefined;
  private readonly completedListeners = new Set<() => void>();

  public state: AutoCaptureState = AutoCaptureState.Idle;

  public constructor(options: AutoCaptureOptions = {}) {
    this.callbacks = options;
    this.scoreThreshold = options.scoreThreshold ?? 90;
    this.stableDurationMilliseconds = options.stableDurationMilliseconds ?? 1000;
  }

  /**
   * Advances the controller using the current guidance result. A score below
   * threshold or a false `ready` flag cancels an active countdown immediately.
   */
  public update(guidance: GuidanceState, now: number = Date.now()): AutoCaptureState {
    if (this.state === AutoCaptureState.Capturing || this.state === AutoCaptureState.Completed) {
      return this.state;
    }

    const canCapture = guidance.overallScore >= this.scoreThreshold && guidance.ready;

    if (!canCapture) {
      if (this.state === AutoCaptureState.CountingDown) {
        this.callbacks.onCancel?.();
      }

      this.countdownStartedAt = undefined;
      this.state = AutoCaptureState.Guiding;
      return this.state;
    }

    if (this.countdownStartedAt === undefined) {
      this.countdownStartedAt = now;
    }

    const elapsedMilliseconds = now - this.countdownStartedAt;
    const remainingMilliseconds = Math.max(0, this.stableDurationMilliseconds - elapsedMilliseconds);

    if (remainingMilliseconds > 0) {
      this.state = AutoCaptureState.CountingDown;
      this.callbacks.onCountdown?.(remainingMilliseconds);
      return this.state;
    }

    this.countdownStartedAt = undefined;
    this.state = AutoCaptureState.Capturing;
    this.callbacks.onCapture?.();
    return this.state;
  }

  /** Marks a triggered capture as completed after the caller has stored the image. */
  public complete(): AutoCaptureState {
    if (this.state === AutoCaptureState.Capturing) {
      this.state = AutoCaptureState.Completed;
      this.callbacks.onCompleted?.();

      for (const listener of this.completedListeners) {
        listener();
      }
    }

    return this.state;
  }

  /** Resets the controller so a later stable guidance state can trigger capture. */
  public reset(): AutoCaptureState {
    this.countdownStartedAt = undefined;
    this.state = AutoCaptureState.Idle;
    return this.state;
  }

  /** Subscribes to successful capture completion events. */
  public subscribeCompleted(listener: () => void): () => void {
    this.completedListeners.add(listener);

    return () => {
      this.completedListeners.delete(listener);
    };
  }
}
