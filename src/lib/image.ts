// canvas.toBlob() silently falls back to PNG on browsers without WebP
// encoding support (older Safari) instead of erroring, so probe once up
// front rather than trusting the requested mime type blindly.
let webpSupported: boolean | null = null;
function supportsWebP(): boolean {
  if (webpSupported == null) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupported;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function encode(img: HTMLImageElement, maxDim: number, quality: number, mimeType: string): Promise<Blob> {
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round(height * (maxDim / width));
      width = maxDim;
    } else {
      width = Math.round(width * (maxDim / height));
      height = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))), mimeType, quality);
  });
}

const DEFAULT_MAX_BYTES = 500 * 1024; // heavy compression — a couple hundred KB, not multi-MB originals
const MIN_DIM = 320;

/**
 * Downscales, re-encodes as WebP (falling back to JPEG where WebP encoding
 * isn't available) and then ratchets quality/dimensions down further until
 * the result fits under maxBytes. Everything uploaded to storage should go
 * through this — nothing should ever land in the database at its original
 * multi-megabyte size.
 */
export async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.8,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<Blob> {
  const img = await loadImage(file);
  const mimeType = supportsWebP() ? 'image/webp' : 'image/jpeg';

  let dim = maxDim;
  let q = quality;
  let blob = await encode(img, dim, q, mimeType);

  let attempts = 0;
  while (blob.size > maxBytes && attempts < 10) {
    if (q > 0.4) {
      q = Math.max(0.4, q - 0.12);
    } else if (dim > MIN_DIM) {
      dim = Math.max(MIN_DIM, Math.round(dim * 0.75));
    } else {
      break; // already at the quality/size floor — ship what we have
    }
    blob = await encode(img, dim, q, mimeType);
    attempts++;
  }

  return blob;
}
