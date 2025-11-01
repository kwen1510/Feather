import heic2any from 'heic2any';

// Ably message size limit considerations
const MB = 1024 * 1024;
const TARGET_BASE64_BYTES = 50 * 1024; // 50KB encoded (leaves headroom under 64KB limit)

// Multi-step compression strategy (from iPad tool)
const COMPRESSION_STEPS = [
  { dimension: 1400, quality: 0.55 },
  { dimension: 1100, quality: 0.5 },
  { dimension: 920, quality: 0.46 },
  { dimension: 760, quality: 0.42 },
  { dimension: 620, quality: 0.4 },
  { dimension: 520, quality: 0.36 },
  { dimension: 420, quality: 0.32 },
  { dimension: 320, quality: 0.28 },
  { dimension: 240, quality: 0.25 },
  { dimension: 200, quality: 0.22 },
  { dimension: 160, quality: 0.2 },
  { dimension: 128, quality: 0.18 },
];

// Helper: replace file extension
const replaceExtension = (name, newExt) => {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? `${name}.${newExt}` : `${name.slice(0, idx)}.${newExt}`;
};

// Helper: convert blob to data URL
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

// Helper: load image from blob
const loadImage = (blob) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

// Helper: calculate data URL size in bytes
const dataUrlBytes = (dataUrl) => new Blob([dataUrl]).size;

// Helper: convert blob to File
const toFile = (input, name, type) =>
  input instanceof File && input.type === type ? input : new File([input], name, { type });

// Core: resample image with canvas
const resampleImage = async (blob, opts) => {
  if (!blob.type.startsWith('image/') || blob.type === 'image/gif') {
    return blob;
  }

  const img = await loadImage(blob);
  const maxDimension = Math.max(img.width, img.height);
  const scaleLimit = Math.min(1, opts.maxDimension / maxDimension);
  const shouldResize = opts.force || maxDimension > opts.maxDimension;
  const shouldChangeType = !!opts.targetType && opts.targetType !== blob.type;
  const shouldAdjustQuality = opts.quality < 0.98;

  if (!shouldResize && !shouldChangeType && !shouldAdjustQuality) {
    return blob;
  }

  const scale = shouldResize ? scaleLimit : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return blob;
  }

  // White background for transparency (helps PNG → JPEG)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const targetType = opts.targetType ?? (blob.type === 'image/png' ? 'image/png' : 'image/jpeg');
  const quality = Math.max(0.05, Math.min(1, opts.quality));

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (maybeBlob) => {
        if (maybeBlob) {
          resolve(maybeBlob);
        } else {
          reject(new Error('Unable to convert image to blob'));
        }
      },
      targetType,
      quality,
    );
  });
};

// Core: aggressive multi-step compression
const aggressivelyCompress = async (file) => {
  let current = file;
  let dataUrl = await blobToDataUrl(current);
  let encodedBytes = dataUrlBytes(dataUrl);

  console.log(`📸 Initial size: ${(encodedBytes / 1024).toFixed(1)} KB encoded`);

  if (encodedBytes <= TARGET_BASE64_BYTES) {
    console.log('✅ Image already within size limit');
    return { file: current, dataUrl, encodedBytes, withinLimit: true };
  }

  // Iterate through compression steps
  for (let i = 0; i < COMPRESSION_STEPS.length; i++) {
    const step = COMPRESSION_STEPS[i];
    console.log(`📸 Compression step ${i + 1}/${COMPRESSION_STEPS.length}: ${step.dimension}px @ ${step.quality} quality`);

    const compressedBlob = await resampleImage(current, {
      maxDimension: step.dimension,
      quality: step.quality,
      targetType: 'image/jpeg',
      force: true,
    });

    current = toFile(compressedBlob, replaceExtension(current.name, 'jpg'), 'image/jpeg');
    dataUrl = await blobToDataUrl(current);
    encodedBytes = dataUrlBytes(dataUrl);

    console.log(`📸 Result: ${(encodedBytes / 1024).toFixed(1)} KB encoded`);

    if (encodedBytes <= TARGET_BASE64_BYTES) {
      console.log(`✅ Image compressed successfully in ${i + 1} step${i === 0 ? '' : 's'}`);
      return { file: current, dataUrl, encodedBytes, withinLimit: true };
    }
  }

  // Failed to compress enough
  console.warn(`⚠️ Image still too large after ${COMPRESSION_STEPS.length} compression steps`);
  return { file: current, dataUrl, encodedBytes, withinLimit: false };
};

// Main export: process and compress image (replaces old resizeAndCompressImage)
export const resizeAndCompressImage = async (file) => {
  console.log('📸 Processing image:', file.name, file.type, `${(file.size / MB).toFixed(2)} MB`);

  let workingFile = file;
  let mimeType = file.type;
  let fileName = file.name || 'photo.jpg';

  // STEP 1: Convert HEIC to JPEG if needed
  const looksHeic = mimeType === 'image/heic' || fileName.toLowerCase().endsWith('.heic');
  if (looksHeic) {
    console.log('📸 Detected HEIC format, converting to JPEG...');
    try {
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.92,
      });
      const heicBlob = Array.isArray(converted) ? converted[0] : converted;
      workingFile = heicBlob;
      mimeType = heicBlob.type || 'image/jpeg';
      fileName = replaceExtension(fileName, 'jpg');
      console.log('✅ HEIC converted to JPEG');
    } catch (error) {
      console.error('❌ HEIC conversion failed:', error);
      throw new Error(`Failed to convert HEIC image: ${error.message}. Try using a different image format.`);
    }
  }

  // STEP 2: Ensure we have a File object
  const initialFile =
    workingFile instanceof File
      ? workingFile
      : new File([workingFile], fileName, { type: mimeType || 'image/jpeg' });

  // STEP 3: Convert to JPEG if not already
  let jpegFile = initialFile;
  if (jpegFile.type !== 'image/jpeg') {
    console.log('📸 Converting to JPEG format...');
    const convertedBlob = await resampleImage(jpegFile, {
      maxDimension: Math.max(COMPRESSION_STEPS[0]?.dimension ?? 1600, 1600),
      quality: 0.85,
      targetType: 'image/jpeg',
      force: true,
    });
    jpegFile = toFile(convertedBlob, replaceExtension(fileName, 'jpg'), 'image/jpeg');
    console.log('✅ Converted to JPEG');
  }

  // STEP 4: Aggressively compress until it fits
  const { file: compressedFile, dataUrl, encodedBytes, withinLimit } = await aggressivelyCompress(
    toFile(jpegFile, replaceExtension(fileName, 'jpg'), 'image/jpeg'),
  );

  if (!withinLimit) {
    throw new Error(
      `Image still too large after compression (${(encodedBytes / 1024).toFixed(1)} KB encoded, limit is ${(TARGET_BASE64_BYTES / 1024).toFixed(1)} KB). ` +
      `Please try a smaller image, crop the photo, or move closer to the subject.`,
    );
  }

  console.log('✅ Image processing complete');

  // Get final dimensions by loading the compressed image
  let finalWidth = 800; // Default fallback
  let finalHeight = 600; // Default fallback
  try {
    const finalImg = await loadImage(compressedFile);
    finalWidth = finalImg.width;
    finalHeight = finalImg.height;
  } catch (error) {
    console.warn('Could not get final dimensions, using defaults:', error);
  }

  // Return format compatible with Feather
  return {
    blob: compressedFile,
    dataUrl: dataUrl,
    width: finalWidth,
    height: finalHeight,
    size: compressedFile.size,
  };
};
