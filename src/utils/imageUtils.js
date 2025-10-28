export const resizeAndCompressImage = async (
  file,
  maxWidth = 800,
  maxHeight = 600,
  quality = 0.7
) => {
  console.log('📸 Processing image:', file.name, file.type, file.size, 'bytes');

  let img;
  let imgWidth;
  let imgHeight;

  // Try createImageBitmap first (modern browsers)
  if (typeof createImageBitmap === 'function') {
    try {
      console.log('📸 Using createImageBitmap');
      const imageBitmap = await createImageBitmap(file);
      imgWidth = imageBitmap.width;
      imgHeight = imageBitmap.height;
      img = imageBitmap;
    } catch (err) {
      console.warn('📸 createImageBitmap failed, using fallback:', err);
      img = null;
    }
  }

  // Fallback for iOS Safari and older browsers
  if (!img) {
    console.log('📸 Using Image() fallback for iOS/Safari');
    img = await new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = (err) => {
        URL.revokeObjectURL(url);
        console.error('📸 Image load error:', err);
        reject(new Error(`Failed to load image: ${file.name}. File may be corrupted or in unsupported format.`));
      };

      image.src = url;
    });

    imgWidth = img.naturalWidth || img.width;
    imgHeight = img.naturalHeight || img.height;
  }

  const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);
  const targetWidth = Math.round(imgWidth * scale);
  const targetHeight = Math.round(imgHeight * scale);

  console.log('📸 Resizing:', imgWidth, 'x', imgHeight, '→', targetWidth, 'x', targetHeight);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  // Set white background for transparency (helps with PNG to JPEG conversion)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Convert to blob
  const blob = await new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (result) => {
          if (result) {
            console.log('📸 Compressed to:', result.size, 'bytes');
            resolve(result);
          } else {
            console.error('📸 Canvas toBlob returned null');
            reject(new Error('Failed to compress image. Canvas may be too large or device out of memory.'));
          }
        },
        'image/jpeg',
        quality
      );
    } catch (err) {
      console.error('📸 Canvas toBlob error:', err);
      reject(new Error(`Failed to compress image: ${err.message}`));
    }
  });

  // Convert to data URL
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      console.log('📸 Data URL created, length:', reader.result.length);
      resolve(reader.result);
    };
    reader.onerror = (err) => {
      console.error('📸 Failed to create data URL:', err, reader.error);
      reject(new Error(`Failed to create data URL: ${reader.error?.message || 'Unknown FileReader error'}`));
    };
    reader.readAsDataURL(blob);
  });

  console.log('📸 ✅ Image processing complete');

  return {
    blob,
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    size: blob.size,
  };
};

