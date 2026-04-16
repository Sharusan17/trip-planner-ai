export interface CompressResult {
  file: File;
  previewUrl: string;        // object URL of the compressed image — revoke when done
  originalMB: number;
  compressedMB: number;
}

/**
 * Compresses an image file client-side using the Canvas API.
 * - Scales down to maxDimension (longest side) if larger
 * - Exports as JPEG at the given quality
 * - Works with JPEG, PNG, WebP, and HEIC (on browsers that support HEIC decoding)
 */
export function compressImage(
  file: File,
  maxDimension = 1920,
  quality = 0.85,
): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    const srcUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(srcUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }

      // White background so transparent PNGs look clean as JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Compression failed')); return; }
        const name         = file.name.replace(/\.[^.]+$/, '.jpg');
        const compressed   = new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
        const previewUrl   = URL.createObjectURL(blob);
        resolve({
          file:         compressed,
          previewUrl,
          originalMB:   +(file.size     / 1024 / 1024).toFixed(1),
          compressedMB: +(blob.size     / 1024 / 1024).toFixed(1),
        });
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(srcUrl);
      reject(new Error('Could not read image — try saving as JPG first'));
    };

    img.src = srcUrl;
  });
}
