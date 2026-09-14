const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);
const { app } = require('electron');

class FrameManager {
  constructor() {
    const userDataDir = (app && typeof app.getPath === 'function') ? app.getPath('userData') : process.cwd();
    this.rootDir = (app && typeof app.getAppPath === 'function') ? app.getAppPath() : path.join(__dirname, '..', '..', '..');
    this.templatesDir = path.join(this.rootDir, 'assets', 'templates');
    this.framesDir = path.join(userDataDir, 'frames');
    this.layersDir = path.join(this.framesDir, 'layers');
    this.currentOverlayPath = path.join(this.framesDir, 'current_overlay.png');
    
    this.ensureDirs();
    this.ensureBuiltinTemplates().catch(err => console.warn('[FrameManager] Template init warn:', err));
  }

  ensureDirs() {
    try {
      if (!fs.existsSync(this.framesDir)) {
        fs.mkdirSync(this.framesDir, { recursive: true });
      }
      if (!fs.existsSync(this.layersDir)) {
        fs.mkdirSync(this.layersDir, { recursive: true });
      }
    } catch (err) {
      console.error('[FrameManager] Failed to create frame directories:', err);
    }
  }

  /**
   * Helper to convert aspect ratio string into dimensions for rendering/merging.
   * @param {string} aspectRatio 
   * @returns {{width: number, height: number}}
   */
  getAspectRatioDimensions(aspectRatio) {
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
   * Imports an external image file into application layers storage
   * @param {string} sourceFilePath
   * @returns {Promise<Object>} layer metadata object
   */
  async importLayerFile(sourceFilePath) {
    this.ensureDirs();
    if (!fs.existsSync(sourceFilePath)) {
      throw new Error(`Layer source file does not exist: ${sourceFilePath}`);
    }

    const ext = path.extname(sourceFilePath).toLowerCase() || '.png';
    const parsedName = path.parse(sourceFilePath).name;
    const sanitizedName = parsedName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueId = `layer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const targetFileName = `${uniqueId}_${sanitizedName}${ext}`;
    const targetFilePath = path.join(this.layersDir, targetFileName);

    await fs.promises.copyFile(sourceFilePath, targetFilePath);

    let originalWidth = 1800;
    let originalHeight = 1200;
    try {
      const meta = await sharp(targetFilePath).metadata();
      if (meta.width && meta.height) {
        originalWidth = meta.width;
        originalHeight = meta.height;
      }
    } catch (e) {
      console.warn('[FrameManager] Could not inspect layer image metadata:', e);
    }

    return {
      id: uniqueId,
      name: parsedName,
      fileName: targetFileName,
      filePath: targetFilePath,
      x: 0,
      y: 0,
      scale: 100,
      visible: true,
      originalWidth,
      originalHeight
    };
  }

  /**
   * Removes a layer image file from storage
   * @param {string} fileNameOrPath 
   */
  async deleteLayerFile(fileNameOrPath) {
    if (!fileNameOrPath) return;
    const baseName = path.basename(fileNameOrPath);
    const targetPath = path.join(this.layersDir, baseName);
    if (fs.existsSync(targetPath)) {
      try {
        await fs.promises.unlink(targetPath);
      } catch (err) {
        console.error(`[FrameManager] Failed to delete layer file ${targetPath}:`, err);
      }
    }
  }

  /**
   * Merges multiple layers into a single high-resolution overlay PNG.
   * Follows the sharp compositing pipeline established in App server imageService.
   * 
   * @param {Array} layers Array of layer objects { filePath, x, y, scale, visible }
   * @param {string} aspectRatio '3:2' | '4:3' | '1:1' | '2:3' | '9:16' | '16:9'
   * @returns {Promise<string>} Path to generated composite overlay file
   */
  async renderCompositeOverlay(layers = [], aspectRatio = '3:2') {
    this.ensureDirs();
    const dimensions = this.getAspectRatioDimensions(aspectRatio);

    const validLayers = layers.filter(layer => {
      if (layer.visible === false) return false;
      const fileToVerify = layer.filePath || path.join(this.layersDir, layer.fileName || '');
      return fs.existsSync(fileToVerify);
    });

    if (validLayers.length === 0) {
      // If there are no layers, remove current overlay so photo is not stamped with old overlay
      if (fs.existsSync(this.currentOverlayPath)) {
        try {
          fs.unlinkSync(this.currentOverlayPath);
        } catch (e) {}
      }
      return '';
    }

    const compositeList = [];
    // Process in reverse order so index 0 (topmost in UI list) is composited last (on top)
    for (let i = validLayers.length - 1; i >= 0; i--) {
      const layer = validLayers[i];
      const absolutePath = layer.filePath || path.join(this.layersDir, layer.fileName);

      const scale = (layer.scale !== undefined ? parseFloat(layer.scale) : 100) / 100;
      const xPercent = layer.x !== undefined ? parseFloat(layer.x) : 0;
      const yPercent = layer.y !== undefined ? parseFloat(layer.y) : 0;

      const layerWidth = Math.max(1, Math.round(dimensions.width * scale));
      const layerHeight = Math.max(1, Math.round(dimensions.height * scale));

      const leftPx = Math.round(dimensions.width * (xPercent / 100));
      const topPx = Math.round(dimensions.height * (yPercent / 100));

      try {
        const layerBuffer = await sharp(absolutePath)
          .resize(layerWidth, layerHeight, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toBuffer();

        compositeList.push({
          input: layerBuffer,
          top: topPx,
          left: leftPx,
          blend: 'over'
        });
      } catch (err) {
        console.error(`[FrameManager] Failed to process layer ${layer.name || layer.id}:`, err);
      }
    }

    if (compositeList.length === 0) {
      return '';
    }

    // Create transparent base canvas and composite all layers on top
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
    .toFile(this.currentOverlayPath);

    return this.currentOverlayPath;
  }

  /**
   * Ensures an initial sample frame layer is available for demo if no layers exist
   */
  async ensureSampleLayer() {
    this.ensureDirs();
    const sampleLayerName = 'sample_default_frame.png';
    const sampleLayerPath = path.join(this.layersDir, sampleLayerName);

    if (!fs.existsSync(sampleLayerPath)) {
      const svgFrame = `
        <svg width="1800" height="1200" xmlns="http://www.w3.org/2000/svg">
          <!-- Outer border -->
          <rect x="24" y="24" width="1752" height="1152" fill="none" stroke="#f43f5e" stroke-width="8" rx="20" opacity="0.85"/>
          <rect x="36" y="36" width="1728" height="1128" fill="none" stroke="#ffffff" stroke-width="2" rx="16" opacity="0.4"/>
          <!-- Elegant Bottom Banner -->
          <rect x="50" y="1110" width="1700" height="50" fill="#0f172a" rx="10" opacity="0.85" />
          <text x="900" y="1142" fill="#ffffff" font-size="22" font-family="'Outfit', sans-serif" font-weight="700" letter-spacing="4" text-anchor="middle">
            PHOTOBOOTH STUDIO PRO • 2026
          </text>
        </svg>
      `;
      try {
        await sharp(Buffer.from(svgFrame)).png().toFile(sampleLayerPath);
      } catch (e) {
        console.warn('[FrameManager] Failed to create sample layer:', e);
      }
    }

    return {
      id: 'default_frame_layer',
      name: 'Khung Mẫu Studio Pro (3:2)',
      fileName: sampleLayerName,
      filePath: sampleLayerPath,
      x: 0,
      y: 0,
      scale: 100,
      visible: true,
      originalWidth: 1800,
      originalHeight: 1200
    };
  }

  /**
   * Ensures builtin template PNG files exist in assets/templates/
   */
  async ensureBuiltinTemplates() {
    try {
      if (!fs.existsSync(this.templatesDir)) {
        fs.mkdirSync(this.templatesDir, { recursive: true });
      }
      const generatorPath = path.join(this.rootDir, 'scripts', 'generate-builtin-templates.js');
      if (fs.existsSync(generatorPath)) {
        const generator = require(generatorPath);
        let missing = false;
        for (const t of BUILTIN_TEMPLATES) {
          const p = path.join(this.templatesDir, t.fileName);
          if (!fs.existsSync(p)) {
            missing = true;
            break;
          }
        }
        if (missing && generator && generator.generateAllTemplates) {
          console.log('[FrameManager] Generating missing builtin templates...');
          await generator.generateAllTemplates();
        }
      }
    } catch (e) {
      console.warn('[FrameManager] Check builtin templates notice:', e.message);
    }
  }

  /**
   * Gets list of all builtin preset templates with metadata and file status
   */
  getBuiltinTemplates() {
    return BUILTIN_TEMPLATES.map(t => {
      const filePath = path.join(this.templatesDir, t.fileName);
      return {
        ...t,
        filePath,
        exists: fs.existsSync(filePath)
      };
    });
  }

  /**
   * Applies a preset template by importing it into user layers and re-rendering overlay
   * @param {string} templateId
   * @returns {Promise<{success: boolean, template: Object, layers: Array, aspectRatio: string, overlayPath: string}>}
   */
  async applyBuiltinTemplate(templateId) {
    this.ensureDirs();
    const template = BUILTIN_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const templatePath = path.join(this.templatesDir, template.fileName);
    if (!fs.existsSync(templatePath)) {
      await this.ensureBuiltinTemplates();
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template image file missing: ${template.fileName}`);
      }
    }

    const layer = await this.importLayerFile(templatePath);
    layer.name = template.name;

    const layers = [layer];
    const aspectRatio = template.aspectRatio;
    const overlayPath = await this.renderCompositeOverlay(layers, aspectRatio);

    return {
      success: true,
      template,
      layers,
      aspectRatio,
      overlayPath
    };
  }
}

const BUILTIN_TEMPLATES = [
  {
    id: 'preset_korean_4cut',
    name: 'Hàn Quốc 4-Cut (Life4Cuts)',
    category: 'Photostrip',
    aspectRatio: '2:3',
    description: 'Phong cách photostrip Hàn Quốc cực hot, viền pastel tối giản, barcode & typo kỷ niệm',
    fileName: 'frame_korean_4cut.png',
    badge: '2:3'
  },
  {
    id: 'preset_wedding_luxury',
    name: 'Tiệc Cưới Hoàng Gia (Wedding Luxury)',
    category: 'Wedding',
    aspectRatio: '3:2',
    description: 'Viền vàng champagne sang trọng, họa tiết hoa văn góc tinh tế cho ngày trọng đại',
    fileName: 'frame_wedding_luxury.png',
    badge: '3:2'
  },
  {
    id: 'preset_birthday_party',
    name: 'Sinh Nhật Rực Rỡ (Birthday Party)',
    category: 'Celebration',
    aspectRatio: '3:2',
    description: 'Dây cờ lễ hội, pháo giấy confetti lung linh, bóng bay ngập tràn năng lượng',
    fileName: 'frame_birthday_party.png',
    badge: '3:2'
  },
  {
    id: 'preset_polaroid_vintage',
    name: 'Polaroid Cổ Điển (Vintage Instant)',
    category: 'Vintage',
    aspectRatio: '4:3',
    description: 'Viền film Polaroid kinh điển với lề dưới rộng đặc trưng và chữ ký tay hoài niệm',
    fileName: 'frame_polaroid_vintage.png',
    badge: '4:3'
  },
  {
    id: 'preset_y2k_neon',
    name: 'Cyberpunk Y2K Neon Glow',
    category: 'Cyber Y2K',
    aspectRatio: '1:1',
    description: 'Phát sáng neon Cyan/Pink rực rỡ, ngôi sao 4 cánh Y2K và HUD công nghệ phá cách',
    fileName: 'frame_y2k_neon.png',
    badge: '1:1'
  },
  {
    id: 'preset_studio_pro',
    name: 'Studio Pro Minimalist',
    category: 'Studio',
    aspectRatio: '3:2',
    description: 'Viền đôi tối giản chuẩn chụp chân dung studio chuyên nghiệp với viewfinder HUD',
    fileName: 'frame_studio_pro.png',
    badge: '3:2'
  }
];

module.exports = new FrameManager();

