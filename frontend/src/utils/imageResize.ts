export async function resizeImageFileToDataUrl(
  file: File,
  maxDimension = 1920,
  quality = 0.86,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File yang dipilih harus berupa gambar (JPG, PNG, WebP, atau AVIF).');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Ukuran gambar terlalu besar (maksimal 20 MB).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca file gambar.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Format gambar tidak dapat dimuat.'));
    el.src = rawDataUrl;
  });

  const srcWidth = img.naturalWidth || img.width || 1280;
  const srcHeight = img.naturalHeight || img.height || 720;
  const scale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight));
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return rawDataUrl;
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  const outputMime = file.type === 'image/png' && file.size <= 1.2 * 1024 * 1024
    ? 'image/png'
    : 'image/jpeg';
  return canvas.toDataURL(outputMime, quality);
}
