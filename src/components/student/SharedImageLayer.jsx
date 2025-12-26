import React, { useEffect, useState } from 'react';
import { Image as KonvaImage } from 'react-konva';

/**
 * Renders the shared image on the canvas while preserving aspect ratio.
 * Expects canvas dimensions to be provided so it can center the image correctly.
 */
const SharedImageLayer = ({ sharedImage, canvasWidth, canvasHeight }) => {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!sharedImage) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.src = sharedImage.dataUrl;
    img.onload = () => setImage(img);
  }, [sharedImage]);

  if (!sharedImage || !image || !canvasWidth || !canvasHeight) {
    return null;
  }

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  if (!imageWidth || !imageHeight) {
    return null;
  }

  const imageAspect = imageWidth / imageHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let displayWidth;
  let displayHeight;
  let x;
  let y;

  if (imageAspect > canvasAspect) {
    displayWidth = canvasWidth;
    displayHeight = canvasWidth / imageAspect;
    x = 0;
    y = (canvasHeight - displayHeight) / 2;
  } else {
    displayHeight = canvasHeight;
    displayWidth = canvasHeight * imageAspect;
    x = (canvasWidth - displayWidth) / 2;
    y = 0;
  }

  displayWidth = Math.min(displayWidth, canvasWidth);
  displayHeight = Math.min(displayHeight, canvasHeight);

  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={displayWidth}
      height={displayHeight}
      listening={false}
    />
  );
};

export default SharedImageLayer;
