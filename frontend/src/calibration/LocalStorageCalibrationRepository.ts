import { isCalibrationObservation, type CalibrationObservation } from './CalibrationObservation';
import type { CalibrationRepository } from './CalibrationRepository';
import type { CaptureAngle } from '../guide/TargetLayout';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = 'ai-vehicle-calibration:v1';

function storageKey(vehicleId: string, captureAngle: CaptureAngle): string {
  return `${STORAGE_PREFIX}:${vehicleId}:${captureAngle}`;
}

export class LocalStorageCalibrationRepository implements CalibrationRepository {
  private readonly storage: KeyValueStorage;

  public constructor(storage: KeyValueStorage = window.localStorage) {
    this.storage = storage;
  }

  public list(vehicleId: string, captureAngle: CaptureAngle): CalibrationObservation[] {
    const raw = this.storage.getItem(storageKey(vehicleId, captureAngle));

    if (raw === null) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(isCalibrationObservation);
    } catch {
      return [];
    }
  }

  public save(observation: CalibrationObservation): void {
    const observations = this.list(observation.vehicleId, observation.captureAngle);
    const next = [
      ...observations.filter((candidate) => candidate.id !== observation.id),
      observation,
    ];
    this.storage.setItem(storageKey(observation.vehicleId, observation.captureAngle), JSON.stringify(next));
  }

  public remove(observationId: string): void {
    for (const key of this.findStorageKeys()) {
      const parsed = this.readKey(key);
      const next = parsed.filter((observation) => observation.id !== observationId);

      if (next.length !== parsed.length) {
        this.storage.setItem(key, JSON.stringify(next));
      }
    }
  }

  public clear(vehicleId: string, captureAngle: CaptureAngle): void {
    this.storage.removeItem(storageKey(vehicleId, captureAngle));
  }

  public export(vehicleId: string, captureAngle: CaptureAngle): string {
    return JSON.stringify(this.list(vehicleId, captureAngle), null, 2);
  }

  private readKey(key: string): CalibrationObservation[] {
    const raw = this.storage.getItem(key);

    if (raw === null) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isCalibrationObservation) : [];
    } catch {
      return [];
    }
  }

  private findStorageKeys(): string[] {
    if (!('length' in this.storage) || typeof this.storage.length !== 'number') {
      return [];
    }

    const storageWithKeys = this.storage as Storage;
    const keys: string[] = [];

    for (let index = 0; index < storageWithKeys.length; index += 1) {
      const key = storageWithKeys.key(index);

      if (key?.startsWith(STORAGE_PREFIX) === true) {
        keys.push(key);
      }
    }

    return keys;
  }
}
