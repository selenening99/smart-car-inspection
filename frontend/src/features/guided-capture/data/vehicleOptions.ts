import hondaFitImage from '../../../assets/vehicles/honda-fit.png';
import toyotaAltisImage from '../../../assets/vehicles/toyota-altis.png';
import toyotaAltisHybridImage from '../../../assets/vehicles/toyota-altis-hybrid.png';
import toyotaCorollaCrossImage from '../../../assets/vehicles/toyota-corolla-cross.png';
import toyotaSienta7Image from '../../../assets/vehicles/toyota-sienta7.png';
import toyotaYarisImage from '../../../assets/vehicles/toyota-yaris.png';
import toyotaYarisCrossImage from '../../../assets/vehicles/toyota-yaris-cross.png';
import type { VehicleId } from '../../../guide/VehicleProfiles';

export type VehicleModel =
  | 'TOYOTA YARIS'
  | 'TOYOTA ALTIS'
  | 'TOYOTA SIENTA7'
  | 'TOYOTA ALTIS HYBRID'
  | 'TOYOTA YARIS CROSS'
  | 'TOYOTA COROLLA CROSS'
  | 'HONDA FIT';

export interface VehicleOption {
  value: VehicleModel;
  label: string;
  imageSrc: string;
  imageAlt: string;
  vehicleId?: VehicleId;
}

export const VEHICLE_OPTIONS = [
  {
    value: 'TOYOTA YARIS',
    label: 'TOYOTA YARIS',
    imageSrc: toyotaYarisImage,
    imageAlt: 'TOYOTA YARIS 車型示意圖',
    vehicleId: 'yaris',
  },
  {
    value: 'TOYOTA ALTIS',
    label: 'TOYOTA ALTIS',
    imageSrc: toyotaAltisImage,
    imageAlt: 'TOYOTA ALTIS 車型示意圖',
    vehicleId: 'altis',
  },
  {
    value: 'TOYOTA SIENTA7',
    label: 'TOYOTA SIENTA7',
    imageSrc: toyotaSienta7Image,
    imageAlt: 'TOYOTA SIENTA7 車型示意圖',
  },
  {
    value: 'TOYOTA ALTIS HYBRID',
    label: 'TOYOTA ALTIS HYBRID',
    imageSrc: toyotaAltisHybridImage,
    imageAlt: 'TOYOTA ALTIS HYBRID 車型示意圖',
  },
  {
    value: 'TOYOTA YARIS CROSS',
    label: 'TOYOTA YARIS CROSS',
    imageSrc: toyotaYarisCrossImage,
    imageAlt: 'TOYOTA YARIS CROSS 車型示意圖',
    vehicleId: 'yaris-cross',
  },
  {
    value: 'TOYOTA COROLLA CROSS',
    label: 'TOYOTA COROLLA CROSS',
    imageSrc: toyotaCorollaCrossImage,
    imageAlt: 'TOYOTA COROLLA CROSS 車型示意圖',
    vehicleId: 'corolla-cross',
  },
  {
    value: 'HONDA FIT',
    label: 'HONDA FIT',
    imageSrc: hondaFitImage,
    imageAlt: 'HONDA FIT 車型示意圖',
  },
] as const satisfies readonly VehicleOption[];

export function getVehicleOption(vehicleModel: VehicleModel | ''): VehicleOption | undefined {
  if (vehicleModel === '') {
    return undefined;
  }

  return VEHICLE_OPTIONS.find((option) => option.value === vehicleModel);
}

export function getVehicleIdForModel(vehicleModel: VehicleModel | ''): VehicleId | undefined {
  return getVehicleOption(vehicleModel)?.vehicleId;
}
