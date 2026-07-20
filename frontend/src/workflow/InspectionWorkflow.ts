import type { CaptureAngle } from '../guide/TargetLayout';
import { getVehicleProfile, type VehicleId } from '../guide/VehicleProfiles';

export type InspectionStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export interface InspectionStep {
  vehicleId: VehicleId;
  captureAngle: CaptureAngle;
  status: InspectionStepStatus;
}

export interface InspectionWorkflowState {
  currentVehicle: VehicleId | undefined;
  currentStep: InspectionStep | undefined;
  completedSteps: readonly InspectionStep[];
  remainingSteps: readonly InspectionStep[];
  inspectionProgress: number;
}

/** A UI-independent source that emits only successful auto-capture completion. */
export interface AutoCaptureCompletedSource {
  subscribeCompleted(listener: () => void): () => void;
}

/**
 * Controls the ordered inspection process for one selected vehicle. It neither
 * performs inference nor accesses a camera; its only automatic input is a
 * successful auto-capture completion event.
 */
export class InspectionWorkflow {
  private currentStepIndex: number | undefined;
  private currentVehicle: VehicleId | undefined;
  private readonly unsubscribeAutoCapture: (() => void) | undefined;
  private steps: InspectionStep[] = [];

  public constructor(autoCaptureEvents?: AutoCaptureCompletedSource) {
    this.unsubscribeAutoCapture = autoCaptureEvents?.subscribeCompleted(() => {
      this.completeCurrentStep();
    });
  }

  /** Starts a new vehicle's profile-defined inspection sequence. */
  public startInspection(vehicleId: VehicleId): InspectionWorkflowState {
    const profile = getVehicleProfile(vehicleId);
    this.currentVehicle = vehicleId;
    this.steps = profile.inspectionSequence.map((captureAngle, index) => ({
      vehicleId,
      captureAngle,
      status: index === 0 ? 'active' : 'pending',
    }));
    this.currentStepIndex = this.steps.length > 0 ? 0 : undefined;

    return this.getState();
  }

  /** Returns an immutable copy of the step currently selected in the workflow. */
  public getCurrentStep(): InspectionStep | undefined {
    const currentStep = this.currentStepIndex === undefined ? undefined : this.steps[this.currentStepIndex];

    return currentStep === undefined ? undefined : Object.freeze({ ...currentStep });
  }

  /** Marks the current active/pending step completed and activates the next pending step. */
  public completeCurrentStep(): InspectionWorkflowState {
    const currentStepIndex = this.currentStepIndex;
    const currentStep = currentStepIndex === undefined ? undefined : this.steps[currentStepIndex];

    if (
      currentStepIndex === undefined
      || currentStep === undefined
      || (currentStep.status !== 'active' && currentStep.status !== 'pending')
    ) {
      return this.getState();
    }

    currentStep.status = 'completed';
    this.activateNextPendingStep(currentStepIndex + 1);
    return this.getState();
  }

  /** Marks the current active/pending step skipped and activates the next pending step. */
  public skipCurrentStep(): InspectionWorkflowState {
    const currentStepIndex = this.currentStepIndex;
    const currentStep = currentStepIndex === undefined ? undefined : this.steps[currentStepIndex];

    if (
      currentStepIndex === undefined
      || currentStep === undefined
      || (currentStep.status !== 'active' && currentStep.status !== 'pending')
    ) {
      return this.getState();
    }

    currentStep.status = 'skipped';
    this.activateNextPendingStep(currentStepIndex + 1);
    return this.getState();
  }

  /** Selects the next step for review or capture without changing terminal statuses. */
  public nextStep(): InspectionWorkflowState {
    if (this.currentStepIndex === undefined || this.currentStepIndex >= this.steps.length - 1) {
      return this.getState();
    }

    const currentStep = this.steps[this.currentStepIndex];
    if (currentStep.status === 'active') {
      currentStep.status = 'pending';
    }

    this.currentStepIndex += 1;
    if (this.steps[this.currentStepIndex].status === 'pending') {
      this.steps[this.currentStepIndex].status = 'active';
    }

    return this.getState();
  }

  /** Selects the previous step for review or recapture without changing terminal statuses. */
  public previousStep(): InspectionWorkflowState {
    if (this.currentStepIndex === undefined || this.currentStepIndex === 0) {
      return this.getState();
    }

    const currentStep = this.steps[this.currentStepIndex];
    if (currentStep.status === 'active') {
      currentStep.status = 'pending';
    }

    this.currentStepIndex -= 1;
    if (this.steps[this.currentStepIndex].status === 'pending') {
      this.steps[this.currentStepIndex].status = 'active';
    }

    return this.getState();
  }

  /** Clears the selected vehicle and all inspection progress. */
  public resetInspection(): InspectionWorkflowState {
    this.currentVehicle = undefined;
    this.currentStepIndex = undefined;
    this.steps = [];

    return this.getState();
  }

  /** Returns true only when every profile-required step is terminal. */
  public isInspectionCompleted(): boolean {
    return this.steps.length > 0 && this.steps.every((step) => step.status === 'completed' || step.status === 'skipped');
  }

  /** Returns an immutable snapshot of vehicle, steps, and percentage progress. */
  public getState(): InspectionWorkflowState {
    const currentStep = this.getCurrentStep();
    const completedSteps = this.steps
      .filter((step) => step.status === 'completed')
      .map((step) => Object.freeze({ ...step }));
    const remainingSteps = this.steps
      .filter((step) => step.status === 'pending' || step.status === 'active')
      .map((step) => Object.freeze({ ...step }));
    const terminalStepCount = this.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length;
    const inspectionProgress = this.steps.length === 0 ? 0 : terminalStepCount / this.steps.length * 100;

    return Object.freeze({
      currentVehicle: this.currentVehicle,
      currentStep,
      completedSteps: Object.freeze(completedSteps),
      remainingSteps: Object.freeze(remainingSteps),
      inspectionProgress,
    });
  }

  /** Unsubscribes from a bound auto-capture source when the workflow is discarded. */
  public dispose(): void {
    this.unsubscribeAutoCapture?.();
  }

  private activateNextPendingStep(startIndex: number): void {
    const nextStepIndex = this.steps.findIndex(
      (step, index) => index >= startIndex && step.status === 'pending',
    );

    if (nextStepIndex === -1) {
      this.currentStepIndex = undefined;
      return;
    }

    this.steps[nextStepIndex].status = 'active';
    this.currentStepIndex = nextStepIndex;
  }
}
