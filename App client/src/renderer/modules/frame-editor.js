/**
 * FrameEditor: Interactive Visual WYSIWYG Editor for PhotoBooth Frames & Multi-Layer Overlays.
 * Adapted and enhanced from App server admin.html / room.html layers engine.
 */
function toFileUrl(filePath) {
  if (!filePath) return '';
  let normalized = filePath.replace(/\\/g, '/');
  if (!normalized.startsWith('file://')) {
    if (/^[a-zA-Z]:\//.test(normalized)) {
      normalized = 'file:///' + normalized;
    } else {
      normalized = 'file://' + normalized;
    }
  }
  return normalized;
}

export class FrameEditor {
  constructor() {
    this.modal = document.getElementById('frame-studio-modal');
    this.closeBtn = document.getElementById('frame-studio-close');
    this.saveBtn = document.getElementById('frame-studio-save');
    this.addLayerBtn = document.getElementById('btn-add-layer');
    this.ratioSelect = document.getElementById('frame-aspect-ratio-select');
    this.aspectBox = document.getElementById('studio-aspect-box');
    this.previewContainer = document.getElementById('studio-layers-container');
    this.layersListEl = document.getElementById('studio-layers-list');
    
    // Inspector elements
    this.inspectorBox = document.getElementById('layer-inspector-box');
    this.selectedLayerTitle = document.getElementById('inspector-layer-title');
    this.sliderX = document.getElementById('slider-pos-x');
    this.sliderY = document.getElementById('slider-pos-y');
    this.sliderScale = document.getElementById('slider-scale');
    this.inputX = document.getElementById('input-pos-x');
    this.inputY = document.getElementById('input-pos-y');
    this.inputScale = document.getElementById('input-scale');
    this.btnCenterX = document.getElementById('btn-center-x');
    this.btnCenterY = document.getElementById('btn-center-y');
    this.btnResetScale = document.getElementById('btn-reset-scale');
    this.btnFitFrame = document.getElementById('btn-fit-frame');

    // Sidebar status
    this.sidebarBadge = document.getElementById('frame-status-badge');
    this.sidebarToggle = document.getElementById('toggle-frame-active');
    this.sidebarPresetSelect = document.getElementById('sidebar-preset-select');
    this.btnOpenStudio = document.getElementById('btn-open-frame-studio');

    // Preset gallery elements
    this.presetsGallery = document.getElementById('studio-presets-gallery');
    this.builtinTemplates = [];
    this.activePresetId = null;

    // State
    this.layers = [];
    this.aspectRatio = '3:2';
    this.enabled = true;
    this.selectedIndex = null;

    // Drag / Resize state
    this.isDragging = false;
    this.isResizing = false;
    this.startX = 0;
    this.startY = 0;
    this.startLayerX = 0;
    this.startLayerY = 0;
    this.startScale = 100;
    this.startDistance = 0;

    this.initEvents();
    this.initPresets();
  }

  initEvents() {
    if (this.btnOpenStudio) {
      this.btnOpenStudio.addEventListener('click', () => this.open());
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.sidebarToggle) {
      this.sidebarToggle.addEventListener('change', async (e) => {
        this.enabled = e.target.checked;
        if (window.electronAPI && window.electronAPI.toggleFrameEnabled) {
          await window.electronAPI.toggleFrameEnabled(this.enabled);
        }
        this.updateSidebarBadge();
      });
    }

    if (this.sidebarPresetSelect) {
      this.sidebarPresetSelect.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (val) {
          await this.applyPreset(val);
        }
      });
    }

    if (this.ratioSelect) {
      this.ratioSelect.addEventListener('change', (e) => {
        this.setAspectRatio(e.target.value);
      });
    }

    if (this.addLayerBtn) {
      this.addLayerBtn.addEventListener('click', () => this.handleAddLayer());
    }

    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', () => this.handleSave());
    }

    // Inspector inputs & sliders
    if (this.sliderX) {
      this.sliderX.addEventListener('input', (e) => {
        this.updateActiveLayerProp('x', parseFloat(e.target.value));
        if (this.inputX) this.inputX.value = e.target.value;
      });
    }
    if (this.inputX) {
      this.inputX.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 0;
        this.updateActiveLayerProp('x', val);
        if (this.sliderX) this.sliderX.value = val;
      });
    }

    if (this.sliderY) {
      this.sliderY.addEventListener('input', (e) => {
        this.updateActiveLayerProp('y', parseFloat(e.target.value));
        if (this.inputY) this.inputY.value = e.target.value;
      });
    }
    if (this.inputY) {
      this.inputY.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 0;
        this.updateActiveLayerProp('y', val);
        if (this.sliderY) this.sliderY.value = val;
      });
    }

    if (this.sliderScale) {
      this.sliderScale.addEventListener('input', (e) => {
        this.updateActiveLayerProp('scale', parseFloat(e.target.value));
        if (this.inputScale) this.inputScale.value = e.target.value;
      });
    }
    if (this.inputScale) {
      this.inputScale.addEventListener('change', (e) => {
        const val = Math.max(5, parseFloat(e.target.value) || 100);
        this.updateActiveLayerProp('scale', val);
        if (this.sliderScale) this.sliderScale.value = val;
      });
    }

    if (this.btnCenterX) {
      this.btnCenterX.addEventListener('click', () => {
        this.updateActiveLayerProp('x', 0);
        if (this.sliderX) this.sliderX.value = 0;
        if (this.inputX) this.inputX.value = 0;
      });
    }

    if (this.btnCenterY) {
      this.btnCenterY.addEventListener('click', () => {
        this.updateActiveLayerProp('y', 0);
        if (this.sliderY) this.sliderY.value = 0;
        if (this.inputY) this.inputY.value = 0;
      });
    }

    if (this.btnResetScale) {
      this.btnResetScale.addEventListener('click', () => {
        this.updateActiveLayerProp('scale', 100);
        if (this.sliderScale) this.sliderScale.value = 100;
        if (this.inputScale) this.inputScale.value = 100;
      });
    }

    if (this.btnFitFrame) {
      this.btnFitFrame.addEventListener('click', () => {
        this.updateActiveLayerProp('x', 0);
        this.updateActiveLayerProp('y', 0);
        this.updateActiveLayerProp('scale', 100);
        if (this.sliderX) this.sliderX.value = 0;
        if (this.inputX) this.inputX.value = 0;
        if (this.sliderY) this.sliderY.value = 0;
        if (this.inputY) this.inputY.value = 0;
        if (this.sliderScale) this.sliderScale.value = 100;
        if (this.inputScale) this.inputScale.value = 100;
      });
    }

    // Global mouse listeners for interactive dragging & resizing on preview canvas
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());

    // Window resize to keep preview aspect box responsive
    window.addEventListener('resize', () => {
      if (this.modal && this.modal.style.display !== 'none') {
        this.updateAspectBoxDimensions();
      }
    });
  }

  updateAspectBoxDimensions() {
    if (!this.aspectBox) return;
    const parent = this.aspectBox.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const pW = parentRect.width || parent.clientWidth || 600;
    const pH = parentRect.height || parent.clientHeight || 450;

    // Leave breathing room for padding (24px each side = 48px) and bottom hint (~64px)
    const availW = Math.max(160, pW - 48);
    const availH = Math.max(120, pH - 64);

    const ratioParts = (this.aspectRatio || '3:2').split(':').map(Number);
    const rw = (ratioParts[0] && !isNaN(ratioParts[0])) ? ratioParts[0] : 3;
    const rh = (ratioParts[1] && !isNaN(ratioParts[1])) ? ratioParts[1] : 2;
    const targetRatio = rw / rh;

    let finalW, finalH;
    if (availW / availH > targetRatio) {
      finalH = availH;
      finalW = Math.round(finalH * targetRatio);
    } else {
      finalW = availW;
      finalH = Math.round(finalW / targetRatio);
    }

    this.aspectBox.style.width = `${finalW}px`;
    this.aspectBox.style.height = `${finalH}px`;
    this.aspectBox.style.aspectRatio = `${rw} / ${rh}`;
  }

  loadConfig(cfg = {}) {
    this.layers = Array.isArray(cfg.frameLayers) ? JSON.parse(JSON.stringify(cfg.frameLayers)) : [];
    this.aspectRatio = cfg.frameAspectRatio || '3:2';
    this.enabled = cfg.frameEnabled !== false;

    if (this.ratioSelect) {
      this.ratioSelect.value = this.aspectRatio;
    }
    if (this.sidebarToggle) {
      this.sidebarToggle.checked = this.enabled;
    }

    this.updateSidebarBadge();
    this.setAspectRatio(this.aspectRatio);

    if (this.layers.length === 1 && this.builtinTemplates.length > 0) {
      const l = this.layers[0];
      const match = this.builtinTemplates.find(t => t.name === l.name || (l.fileName && (l.fileName.includes(t.id) || l.fileName.includes(t.fileName))));
      this.activePresetId = match ? match.id : null;
    } else {
      this.activePresetId = null;
    }
    if (this.sidebarPresetSelect) {
      this.sidebarPresetSelect.value = this.activePresetId || '';
    }
    this.renderPresetsGallery();
  }

  updateSidebarBadge() {
    if (!this.sidebarBadge) return;
    if (!this.enabled) {
      this.sidebarBadge.textContent = 'Đang tắt';
      this.sidebarBadge.className = 'frame-badge badge-off';
      return;
    }
    const count = this.layers.filter(l => l.visible !== false).length;
    this.sidebarBadge.textContent = `${count} Layer (${this.aspectRatio})`;
    this.sidebarBadge.className = 'frame-badge badge-on';
  }

  setAspectRatio(ratio) {
    this.aspectRatio = ratio;
    if (this.ratioSelect) this.ratioSelect.value = ratio;

    this.updateAspectBoxDimensions();
    this.renderPreview();
    this.updateSidebarBadge();
  }

  open() {
    if (!this.modal) return;
    this.modal.style.display = 'flex';
    if (this.layers.length > 0 && this.selectedIndex === null) {
      this.selectedIndex = 0;
    }
    this.renderLayersList();
    this.updateInspector();
    this.renderPresetsGallery();

    // Use double requestAnimationFrame and timeout to guarantee layout is measured after flex display
    requestAnimationFrame(() => {
      this.updateAspectBoxDimensions();
      this.renderPreview();
    });
    setTimeout(() => {
      this.updateAspectBoxDimensions();
      this.renderPreview();
    }, 40);
  }

  close() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
  }

  async handleAddLayer() {
    if (!window.electronAPI || !window.electronAPI.openLayerDialog) return;
    try {
      const selectedPath = await window.electronAPI.openLayerDialog();
      if (!selectedPath) return;

      const res = await window.electronAPI.importLayerFile(selectedPath);
      if (res && res.success && res.layer) {
        this.layers.push(res.layer);
        this.selectedIndex = this.layers.length - 1;
        this.renderLayersList();
        this.updateAspectBoxDimensions();
        this.renderPreview();
        this.updateInspector();
      } else if (res && res.error) {
        alert(`Lỗi import layer: ${res.error}`);
      }
    } catch (err) {
      console.error('handleAddLayer error:', err);
      alert(`Không thể chọn layer: ${err.message}`);
    }
  }

  async handleSave() {
    if (!window.electronAPI || !window.electronAPI.saveFrameConfig) return;
    try {
      if (this.saveBtn) {
        this.saveBtn.disabled = true;
        this.saveBtn.textContent = 'Đang lưu & Ghép frame...';
      }

      const res = await window.electronAPI.saveFrameConfig({
        layers: this.layers,
        aspectRatio: this.aspectRatio,
        enabled: this.enabled
      });

      if (res && res.success) {
        this.updateSidebarBadge();
        this.close();
      } else {
        alert(`Lỗi khi lưu khung: ${res ? res.error : 'Không rõ'}`);
      }
    } catch (err) {
      console.error('handleSave error:', err);
      alert(`Lỗi: ${err.message}`);
    } finally {
      if (this.saveBtn) {
        this.saveBtn.disabled = false;
        this.saveBtn.innerHTML = `
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
          </svg>
          <span>Lưu Khung &amp; Áp Dụng</span>
        `;
      }
    }
  }

  renderLayersList() {
    if (!this.layersListEl) return;
    this.layersListEl.innerHTML = '';

    if (this.layers.length === 0) {
      this.layersListEl.innerHTML = `
        <div class="empty-layers-hint">
          <svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
            <path d="M7.646 1.146a.5.5 0 0 1 .708 0l1.5 1.5a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L6.854 3.354a.5.5 0 1 1-.708-.708l1.5-1.5z"/>
            <path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z"/>
          </svg>
          <p>Chưa có layer nào. Hãy nhấn <strong>"+ Thêm Ảnh Layer"</strong> để thêm khung viền PNG, Logo sự kiện hoặc Sticker.</p>
        </div>
      `;
      return;
    }

    this.layers.forEach((layer, idx) => {
      const isSelected = idx === this.selectedIndex;
      const item = document.createElement('div');
      item.className = `layer-item ${isSelected ? 'selected' : ''}`;
      
      const fileSrc = layer.filePath ? toFileUrl(layer.filePath) : '';

      item.innerHTML = `
        <div class="layer-thumb-box">
          <img src="${fileSrc}" alt="${layer.name}" onerror="this.style.display='none'" />
        </div>
        <div class="layer-info-col">
          <span class="layer-name" title="${layer.name}">${layer.name}</span>
          <span class="layer-meta">Vị trí: ${Math.round(layer.x || 0)}%, ${Math.round(layer.y || 0)}% • Size: ${Math.round(layer.scale || 100)}%</span>
        </div>
        <div class="layer-actions-row">
          <button type="button" class="btn-layer-tool btn-move-up" title="Đưa lên trên" ${idx === 0 ? 'disabled' : ''}>
            ▲
          </button>
          <button type="button" class="btn-layer-tool btn-move-down" title="Đưa xuống dưới" ${idx === this.layers.length - 1 ? 'disabled' : ''}>
            ▼
          </button>
          <button type="button" class="btn-layer-tool btn-visibility ${layer.visible === false ? 'is-hidden' : ''}" title="Ẩn/Hiện">
            ${layer.visible === false ? '👁️‍🗨️' : '👁️'}
          </button>
          <button type="button" class="btn-layer-tool btn-delete text-rose" title="Xóa layer">
            🗑️
          </button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-layer-tool')) return;
        this.selectedIndex = idx;
        this.renderLayersList();
        this.renderPreview();
        this.updateInspector();
      });

      const btnUp = item.querySelector('.btn-move-up');
      if (btnUp) {
        btnUp.addEventListener('click', (e) => {
          e.stopPropagation();
          this.moveLayer(idx, idx - 1);
        });
      }

      const btnDown = item.querySelector('.btn-move-down');
      if (btnDown) {
        btnDown.addEventListener('click', (e) => {
          e.stopPropagation();
          this.moveLayer(idx, idx + 1);
        });
      }

      const btnVis = item.querySelector('.btn-visibility');
      if (btnVis) {
        btnVis.addEventListener('click', (e) => {
          e.stopPropagation();
          layer.visible = layer.visible === false ? true : false;
          this.renderLayersList();
          this.renderPreview();
        });
      }

      const btnDel = item.querySelector('.btn-delete');
      if (btnDel) {
        btnDel.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Bạn có chắc muốn xóa layer "${layer.name}"?`)) {
            this.deleteLayer(idx);
          }
        });
      }

      this.layersListEl.appendChild(item);
    });
  }

  moveLayer(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= this.layers.length) return;
    const moved = this.layers.splice(fromIdx, 1)[0];
    this.layers.splice(toIdx, 0, moved);
    this.selectedIndex = toIdx;
    this.renderLayersList();
    this.renderPreview();
  }

  async deleteLayer(idx) {
    const layer = this.layers[idx];
    if (!layer) return;
    if (window.electronAPI && window.electronAPI.deleteLayerFile && layer.fileName) {
      await window.electronAPI.deleteLayerFile(layer.fileName);
    }
    this.layers.splice(idx, 1);
    if (this.selectedIndex >= this.layers.length) {
      this.selectedIndex = this.layers.length > 0 ? this.layers.length - 1 : null;
    }
    this.renderLayersList();
    this.renderPreview();
    this.updateInspector();
  }

  updateInspector() {
    if (this.selectedIndex === null || !this.layers[this.selectedIndex]) {
      if (this.inspectorBox) this.inspectorBox.style.opacity = '0.4';
      if (this.selectedLayerTitle) this.selectedLayerTitle.textContent = 'Chưa chọn layer nào';
      return;
    }

    if (this.inspectorBox) this.inspectorBox.style.opacity = '1';
    const layer = this.layers[this.selectedIndex];
    if (this.selectedLayerTitle) this.selectedLayerTitle.textContent = layer.name;

    const x = layer.x !== undefined ? Math.round(layer.x) : 0;
    const y = layer.y !== undefined ? Math.round(layer.y) : 0;
    const s = layer.scale !== undefined ? Math.round(layer.scale) : 100;

    if (this.sliderX) this.sliderX.value = x;
    if (this.inputX) this.inputX.value = x;
    if (this.sliderY) this.sliderY.value = y;
    if (this.inputY) this.inputY.value = y;
    if (this.sliderScale) this.sliderScale.value = s;
    if (this.inputScale) this.inputScale.value = s;
  }

  updateActiveLayerProp(prop, value) {
    if (this.selectedIndex === null || !this.layers[this.selectedIndex]) return;
    this.layers[this.selectedIndex][prop] = value;
    this.renderPreview();
    
    // update meta label in list item
    const item = this.layersListEl?.children[this.selectedIndex];
    if (item) {
      const meta = item.querySelector('.layer-meta');
      const l = this.layers[this.selectedIndex];
      if (meta) meta.textContent = `Vị trí: ${Math.round(l.x || 0)}%, ${Math.round(l.y || 0)}% • Size: ${Math.round(l.scale || 100)}%`;
    }
  }

  renderPreview() {
    if (!this.previewContainer) return;
    this.previewContainer.innerHTML = '';
    this.updateAspectBoxDimensions();

    // Draw layers in reverse order so index 0 is top-most
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (layer.visible === false) continue;

      const isSelected = i === this.selectedIndex;
      const xPercent = layer.x !== undefined ? parseFloat(layer.x) : 0;
      const yPercent = layer.y !== undefined ? parseFloat(layer.y) : 0;
      const scalePercent = layer.scale !== undefined ? parseFloat(layer.scale) : 100;

      const wrapper = document.createElement('div');
      wrapper.className = `studio-layer-box ${isSelected ? 'active-layer' : ''}`;
      wrapper.style.left = `${xPercent}%`;
      wrapper.style.top = `${yPercent}%`;
      wrapper.style.width = `${scalePercent}%`;
      wrapper.style.height = `${scalePercent}%`;
      wrapper.style.zIndex = this.layers.length - i + 1;

      const img = document.createElement('img');
      img.src = layer.filePath ? toFileUrl(layer.filePath) : '';
      img.alt = layer.name;
      img.className = 'studio-layer-img';
      wrapper.appendChild(img);

      if (isSelected) {
        // Drag handle on whole wrapper
        wrapper.addEventListener('mousedown', (e) => this.onLayerMouseDown(e, i));

        // Corner resize handle (Bottom-Right)
        const handleBR = document.createElement('div');
        handleBR.className = 'studio-resize-handle handle-br';
        handleBR.innerHTML = `
          <svg width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
            <path d="M14 14V8h1v7H8v-1h6zM2 14h6v1H1V8h1v6zM14 2H8V1h7v7h-1V2zM2 2v6H1V1h7v1H2z"/>
          </svg>
        `;
        handleBR.addEventListener('mousedown', (e) => this.onResizeMouseDown(e, i));
        wrapper.appendChild(handleBR);
      } else {
        // Click to select this layer
        wrapper.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedIndex = i;
          this.renderLayersList();
          this.renderPreview();
          this.updateInspector();
        });
      }

      this.previewContainer.appendChild(wrapper);
    }
  }

  onLayerMouseDown(e, index) {
    if (e.target.closest('.studio-resize-handle')) return;
    e.preventDefault();
    e.stopPropagation();

    this.isDragging = true;
    this.selectedIndex = index;
    this.startX = e.clientX;
    this.startY = e.clientY;

    const layer = this.layers[index];
    this.startLayerX = layer.x !== undefined ? parseFloat(layer.x) : 0;
    this.startLayerY = layer.y !== undefined ? parseFloat(layer.y) : 0;

    document.body.style.userSelect = 'none';
  }

  onResizeMouseDown(e, index) {
    e.preventDefault();
    e.stopPropagation();

    this.isResizing = true;
    this.selectedIndex = index;
    this.startX = e.clientX;
    this.startY = e.clientY;

    const layer = this.layers[index];
    this.startScale = layer.scale !== undefined ? parseFloat(layer.scale) : 100;

    if (this.aspectBox) {
      const rect = this.aspectBox.getBoundingClientRect();
      const originX = rect.left + (rect.width * ((layer.x || 0) / 100));
      const originY = rect.top + (rect.height * ((layer.y || 0) / 100));
      this.startDistance = Math.hypot(e.clientX - originX, e.clientY - originY);
    }

    document.body.style.userSelect = 'none';
  }

  onMouseMove(e) {
    if (!this.aspectBox) return;
    const rect = this.aspectBox.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (this.isDragging && this.selectedIndex !== null) {
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;

      const dxPercent = (dx / rect.width) * 100;
      const dyPercent = (dy / rect.height) * 100;

      const newX = Math.round(this.startLayerX + dxPercent);
      const newY = Math.round(this.startLayerY + dyPercent);

      this.updateActiveLayerProp('x', newX);
      if (this.sliderX) this.sliderX.value = newX;
      if (this.inputX) this.inputX.value = newX;
      if (this.sliderY) this.sliderY.value = newY;
      if (this.inputY) this.inputY.value = newY;
    } else if (this.isResizing && this.selectedIndex !== null) {
      const layer = this.layers[this.selectedIndex];
      const originX = rect.left + (rect.width * ((layer.x || 0) / 100));
      const originY = rect.top + (rect.height * ((layer.y || 0) / 100));
      const currentDistance = Math.hypot(e.clientX - originX, e.clientY - originY);

      if (this.startDistance > 0) {
        const ratio = currentDistance / this.startDistance;
        let newScale = Math.round(this.startScale * ratio);
        newScale = Math.max(5, Math.min(300, newScale));

        this.updateActiveLayerProp('scale', newScale);
        if (this.sliderScale) this.sliderScale.value = newScale;
        if (this.inputScale) this.inputScale.value = newScale;
      }
    }
  }

  onMouseUp() {
    if (this.isDragging || this.isResizing) {
      this.isDragging = false;
      this.isResizing = false;
      document.body.style.userSelect = '';
      this.renderLayersList();
    }
  }

  async initPresets() {
    if (!window.electronAPI || !window.electronAPI.getBuiltinTemplates) return;
    try {
      const templates = await window.electronAPI.getBuiltinTemplates();
      this.builtinTemplates = Array.isArray(templates) ? templates : [];
      this.populateSidebarPresets();
      this.renderPresetsGallery();

      // If already has 1 layer matching preset, mark it active
      if (this.layers.length === 1) {
        const l = this.layers[0];
        const match = this.builtinTemplates.find(t => t.name === l.name || (l.fileName && (l.fileName.includes(t.id) || l.fileName.includes(t.fileName))));
        if (match) {
          this.activePresetId = match.id;
          if (this.sidebarPresetSelect) this.sidebarPresetSelect.value = match.id;
          this.renderPresetsGallery();
        }
      }
    } catch (err) {
      console.warn('[FrameEditor] Failed to load builtin templates:', err);
    }
  }

  populateSidebarPresets() {
    if (!this.sidebarPresetSelect) return;
    const currentVal = this.sidebarPresetSelect.value;
    this.sidebarPresetSelect.innerHTML = '<option value="">-- Tùy chỉnh (Hiện tại) --</option>';

    this.builtinTemplates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.name} [${t.aspectRatio}]`;
      this.sidebarPresetSelect.appendChild(opt);
    });

    if (this.activePresetId) {
      this.sidebarPresetSelect.value = this.activePresetId;
    } else if (currentVal) {
      this.sidebarPresetSelect.value = currentVal;
    }
  }

  renderPresetsGallery() {
    if (!this.presetsGallery) return;
    this.presetsGallery.innerHTML = '';

    if (!this.builtinTemplates || this.builtinTemplates.length === 0) {
      this.presetsGallery.innerHTML = '<div style="color: #64748b; font-size: 0.72rem; padding: 6px;">Không tìm thấy mẫu khung có sẵn.</div>';
      return;
    }

    this.builtinTemplates.forEach(template => {
      const card = document.createElement('div');
      const isActive = this.activePresetId === template.id;
      card.className = `preset-card ${isActive ? 'active' : ''}`;
      card.dataset.presetId = template.id;

      const fileUrl = toFileUrl(template.filePath);

      card.innerHTML = `
        <div class="preset-thumb-wrap">
          <img src="${fileUrl}" alt="${template.name}" onerror="this.style.display='none'">
          <span class="preset-badge">${template.badge || template.aspectRatio}</span>
        </div>
        <div class="preset-info">
          <div class="preset-name" title="${template.name}">${template.name}</div>
          <div class="preset-desc" title="${template.description}">${template.category}</div>
        </div>
      `;

      card.addEventListener('click', async () => {
        await this.applyPreset(template.id);
      });

      this.presetsGallery.appendChild(card);
    });
  }

  async applyPreset(templateId) {
    if (!templateId || !window.electronAPI || !window.electronAPI.applyBuiltinTemplate) return;
    try {
      const res = await window.electronAPI.applyBuiltinTemplate(templateId);
      if (res && res.success) {
        this.activePresetId = templateId;
        this.aspectRatio = res.aspectRatio || '3:2';
        this.layers = res.layers || [];
        this.enabled = true;
        this.selectedIndex = this.layers.length > 0 ? 0 : null;

        if (this.ratioSelect) this.ratioSelect.value = this.aspectRatio;
        if (this.sidebarToggle) this.sidebarToggle.checked = true;
        if (this.sidebarPresetSelect) this.sidebarPresetSelect.value = templateId;

        this.updateSidebarBadge();
        this.renderLayersList();
        this.updateInspector();
        this.renderPresetsGallery();
        this.updateAspectBoxDimensions();
        this.renderPreview();
      } else if (res && res.error) {
        alert(`Không thể áp dụng mẫu: ${res.error}`);
      }
    } catch (err) {
      console.error('applyPreset error:', err);
      alert(`Lỗi khi áp dụng mẫu: ${err.message}`);
    }
  }
}
