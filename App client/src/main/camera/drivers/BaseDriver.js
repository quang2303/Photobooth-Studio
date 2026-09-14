const EventEmitter = require('events');

class BaseDriver extends EventEmitter {
  constructor() {
    super();
    if (new.target === BaseDriver) {
      throw new TypeError("Cannot construct BaseDriver instances directly");
    }
  }

  /**
   * Khởi tạo driver (check gphoto2 cài đặt, import SDK...)
   */
  async initialize() {
    throw new Error("Method 'initialize()' must be implemented.");
  }

  /**
   * Phát hiện máy ảnh
   * @returns {Promise<{model: string, port: string}|null>}
   */
  async detect() {
    throw new Error("Method 'detect()' must be implemented.");
  }

  /**
   * Bắt đầu luồng live view
   */
  startLiveView() {
    throw new Error("Method 'startLiveView()' must be implemented.");
  }

  /**
   * Dừng luồng live view
   */
  stopLiveView() {
    throw new Error("Method 'stopLiveView()' must be implemented.");
  }

  /**
   * Chụp ảnh chất lượng cao
   * @returns {Promise<string>} Đường dẫn ảnh temp
   */
  async capturePhoto() {
    throw new Error("Method 'capturePhoto()' must be implemented.");
  }

  /**
   * Dọn dẹp tài nguyên khi tắt ứng dụng
   */
  cleanup() {
    // Optional
  }
}

module.exports = BaseDriver;
