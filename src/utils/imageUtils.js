export const resizeAndCompressImage = async (
  file,
  maxWidth = 800,
  maxHeight = 600,
  quality = 0.7
) => {
  const imageBitmap = await createImageBitmap(file);
  const scale = Math.min(maxWidth / imageBitmap.width, maxHeight / imageBitmap.height, 1);

  const targetWidth = Math.round(imageBitmap.width * scale);
  const targetHeight = Math.round(imageBitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('Failed to compress image'));
      },
      'image/jpeg',
      quality
    );
  });

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return {
    blob,
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    size: blob.size,
  };
};

