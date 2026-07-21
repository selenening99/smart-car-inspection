import {
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ref,
  uploadString,
} from 'firebase/storage';
import { db, storage } from '../../firebase';
import type { CaptureAngle, CapturedImage } from '../features/guided-capture/types';

const STORAGE_BUCKET_URL = 'gs://ai-car-inspection-system.firebasestorage.app';

const photoTypeMap: Record<CaptureAngle, string> = {
  'front-left': 'front_left',
  'front-right': 'front_right',
  'rear-left': 'rear_left',
  'rear-right': 'rear_right',
};

interface GpsPosition {
  lat: number | null;
  lng: number | null;
}

interface UploadPickupInspectionParams {
  rentalId: string;
  vehicleId: string;
  capturedImages: readonly CapturedImage[];
  gps: GpsPosition;
}

export function generateRentalId(vehicleId: string): string {
  return `Rental_${vehicleId}_${Date.now()}`;
}

export async function createRental(
  rentalId: string,
  vehicleId: string,
): Promise<void> {
  await setDoc(doc(db, 'rentals', rentalId), {
    vehicle_id: vehicleId,
    status: 'pickup_uploading',
    created_at: serverTimestamp(),
    pickup_photo_count: 0,
    return_photo_count: 0,
    risk_flag: false,
    risk_level: null,
    reviewed_by_staff: false,
    review_notes: null,
    reviewed_at: null,
  });
}

export async function uploadPickupInspection({
  rentalId,
  vehicleId,
  capturedImages,
  gps,
}: UploadPickupInspectionParams): Promise<void> {
  if (capturedImages.length !== 4) {
    throw new Error(`預期上傳 4 張照片，目前只有 ${capturedImages.length} 張`);
  }

  for (const capturedImage of capturedImages) {
    if (!capturedImage.image) {
      throw new Error(`${capturedImage.angle} 缺少圖片資料`);
    }

    const photoType = photoTypeMap[capturedImage.angle];
    const timestamp = Date.now();
    const fileName = `Rental_${vehicleId}*${timestamp}*${photoType}.jpg`;
    const storagePath = `${STORAGE_BUCKET_URL}/${fileName}`;
    const imageRef = ref(storage, storagePath);

    await uploadString(
      imageRef,
      capturedImage.image,
      'data_url',
      {
        contentType: 'image/jpeg',
        customMetadata: {
          rentalId,
          vehicleId,
          photoType,
        },
      },
    );

    const photoRef = doc(collection(db, 'photos'));
    const rentalRef = doc(db, 'rentals', rentalId);

    // 照片紀錄與計數同步提交，避免照片有紀錄但數量沒有增加。
    const batch = writeBatch(db);

    batch.set(photoRef, {
      rental_id: rentalId,
      vehicle_id: vehicleId,
      stage: 'pickup',
      photo_type: photoType,
      file_name: fileName,
      storage_path: storagePath,
      gps_lat: gps.lat,
      gps_lng: gps.lng,
      uploaded_at: serverTimestamp(),
      server_uploaded_at: serverTimestamp(),
      qc_status: 'pending',
      damages: [],
    });

    batch.update(rentalRef, {
      pickup_photo_count: increment(1),
    });

    await batch.commit();
  }

  await updateDoc(doc(db, 'rentals', rentalId), {
    status: 'pickup_uploaded',
  });
}
