const sharp = require('sharp');
sharp.cache(false);
const fs = require('fs');

/**
 * Composites a high-res photo with an overlay frame using sharp
 */
async function compositeFrame(photoInput, frameOverlayPath, outputPath) {
  let pipeline;
  if (Buffer.isBuffer(photoInput)) {
    pipeline = sharp(photoInput).rotate();
  } else {
    if (!fs.existsSync(photoInput)) {
      throw new Error(`High-res photo not found at path: ${photoInput}`);
    }
    pipeline = sharp(photoInput).rotate();
  }

  // 1. Get original photo metadata to preserve full DSLR resolution!
  const photoMetadata = await pipeline.metadata();
  let targetWidth = photoMetadata.width || 1800;
  let targetHeight = photoMetadata.height || 1200;

  // 2. Crop the photo to match the overlay's aspect ratio at high resolution if they differ
  if (frameOverlayPath && fs.existsSync(frameOverlayPath)) {
    try {
      const overlayMetadata = await sharp(frameOverlayPath).metadata();
      if (overlayMetadata.width && overlayMetadata.height) {
        const overlayRatio = overlayMetadata.width / overlayMetadata.height;
        const photoRatio = targetWidth / targetHeight;
        
        // If aspect ratios differ significantly, crop the photo to match the overlay's aspect ratio
        if (Math.abs(overlayRatio - photoRatio) > 0.01) {
          if (photoRatio > overlayRatio) {
            // Photo is wider than overlay: crop the width, keep height
            targetWidth = Math.round(targetHeight * overlayRatio);
          } else {
            // Photo is taller than overlay: crop the height, keep width
            targetHeight = Math.round(targetWidth / overlayRatio);
          }
          pipeline = pipeline.resize(targetWidth, targetHeight, {
            fit: 'cover' // Crop to match aspect ratio of the overlay, preserving photo proportions
          });
        }
      }
    } catch (err) {
      console.error('Failed to read overlay image metadata.', err);
    }
  }

  // 3. Composite overlay on top, scaling overlay up to match the DSLR photo's high-res dimensions!
  if (frameOverlayPath && fs.existsSync(frameOverlayPath)) {
    const overlayResized = await sharp(frameOverlayPath)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .toBuffer();

    pipeline.composite([{ input: overlayResized, blend: 'over' }]);
  }

  // 4. Save with high JPEG quality (95) and disable chroma subsampling (4:4:4) to prevent color bleeding on edges
  await pipeline
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toFile(outputPath);

  return outputPath;
}

module.exports = {
  compositeFrame
};
