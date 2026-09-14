const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

/**
 * Helper to convert aspect ratio string into dimensions for rendering/merging.
 * @param {string} aspectRatio 
 * @returns {{width: number, height: number}}
 */
function getAspectRatioDimensions(aspectRatio) {
  switch (aspectRatio) {
    case '4:3':
      return { width: 1600, height: 1200 };
    case '1:1':
      return { width: 1200, height: 1200 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '2:3':
      return { width: 1200, height: 1800 };
    case '3:4':
      return { width: 1200, height: 1600 };
    case '9:16':
      return { width: 1080, height: 1920 };
    case '3:2':
    default:
      return { width: 1800, height: 1200 };
  }
}

/**
 * Helper to merge multiple image layers using Sharp.
 * 
 * @param {Array} imageLayers 
 * @param {string} roomName 
 * @param {string} publicDir 
 * @param {string} overlayDir 
 * @param {{width: number, height: number}} dimensions 
 * @returns {Promise<string>} Merged overlay file path URL.
 */
async function mergeImageLayers(imageLayers, roomName, publicDir, overlayDir, dimensions) {
  if (imageLayers.length === 0) return '';
  
  // If there's only 1 layer and it is default fit, we can return its URL directly
  if (imageLayers.length === 1) {
    const firstLayer = imageLayers[0];
    const isDefault = (firstLayer.x === undefined || parseFloat(firstLayer.x) === 0) &&
                      (firstLayer.y === undefined || parseFloat(firstLayer.y) === 0) &&
                      (firstLayer.scale === undefined || parseFloat(firstLayer.scale) === 100);
    if (isDefault) {
      return firstLayer.url;
    }
  }

  const outputFilename = `merged-${roomName}-${Date.now()}.png`;
  const outputPath = path.join(overlayDir, outputFilename);

  const compositeList = [];
  // Process in reverse order so index 0 (topmost) is drawn last (on top)
  for (let i = imageLayers.length - 1; i >= 0; i--) {
    const layer = imageLayers[i];
    const absolutePath = path.join(publicDir, layer.url);
    if (fs.existsSync(absolutePath)) {
      const scale = layer.scale !== undefined ? parseFloat(layer.scale) / 100 : 1;
      const xPercent = layer.x !== undefined ? parseFloat(layer.x) : 0;
      const yPercent = layer.y !== undefined ? parseFloat(layer.y) : 0;

      // Calculate width and height of this layer on the final composite
      const layerWidth = Math.round(dimensions.width * scale);
      const layerHeight = Math.round(dimensions.height * scale);

      // Calculate pixel offsets
      const leftPx = Math.round(dimensions.width * (xPercent / 100));
      const topPx = Math.round(dimensions.height * (yPercent / 100));

      const buffer = await sharp(absolutePath)
        .resize(layerWidth, layerHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
      compositeList.push({ input: buffer, top: topPx, left: leftPx });
    }
  }

  if (compositeList.length === 0) return '';

  await sharp({
    create: {
      width: dimensions.width,
      height: dimensions.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite(compositeList)
  .png()
  .toFile(outputPath);

  return `/uploads/overlays/${outputFilename}`;
}

module.exports = {
  getAspectRatioDimensions,
  mergeImageLayers
};
