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

type Decoded = HTMLImageElement | ImageBitmap;

/** Thrown when a photo can't be read at all, with a message fit to show the user. */
export class UnreadableImageError extends Error {}

const isHeic = (file: Blob & { name?: string }) =>
  /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? '');

function loadViaImg(blob: Blob): Promise<HTMLImageElement> {
  // An object URL, not a data URL: base64-inflating a 12 MP photo into a JS
  // string can exhaust memory on lower-end phones.
  const url = URL.createObjectURL(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

async function decode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Some WebViews reject the options bag or the format; try <img> instead.
    }
  }
  return loadViaImg(blob);
}

async function loadImage(file: File): Promise<Decoded> {
  try {
    return await decode(file);
  } catch {
    // Most phones' "high efficiency" camera mode saves HEIC, which Chrome and
    // Android WebViews can't decode. Convert it in JS (lazy-loaded, ~1 MB,
    // only fetched when such a photo actually shows up).
    if (isHeic(file) || file.type === '') {
      try {
        const { default: heic2any } = await import('heic2any');
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        return await decode(Array.isArray(converted) ? converted[0] : converted);
      } catch {
        // fall through to the friendly error
      }
    }
    throw new UnreadableImageError(
      isHeic(file)
        ? "This HEIC photo couldn't be converted. Set the camera to save JPEG, or share it as JPEG."
        : "This photo's format couldn't be read on this phone.",
    );
  }
}

function encode(img: Decoded, maxDim: number, quality: number, mimeType: string): Promise<Blob> {
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

  if ('close' in img) img.close();
  return blob;
}
