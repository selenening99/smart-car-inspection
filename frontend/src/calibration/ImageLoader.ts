/**
 * A decoded dataset image together with the source file that produced it.
 * Keeping loading separate lets the dataset processor orchestrate stages
 * without knowing how browser images are decoded.
 */
export interface LoadedDatasetImage {
  file: File;
  image: HTMLImageElement;
  width: number;
  height: number;
}

/** Loads one dataset file as a browser image and releases its object URL. */
export function loadDatasetImage(file: File): Promise<LoadedDatasetImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        file,
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load ${file.name}.`));
    };
    image.src = url;
  });
}
