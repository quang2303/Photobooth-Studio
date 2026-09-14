# PhotoBooth System — Phân Tích Chi Tiết Hệ Thống

> **Ngày phân tích:** 26/06/2026
> **Phiên bản:** 1.0.0
> **Nền tảng mục tiêu:** Windows (chính), macOS/Linux (phụ)

---

## Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu Trúc Thư Mục](#2-cấu-trúc-thư-mục)
3. [App Client (Electron Desktop)](#3-app-client-electron-desktop)
4. [App Server (Cloud Server)](#4-app-server-cloud-server)
5. [Luồng Dữ Liệu Chính](#5-luồng-dữ-liệu-chính)
6. [Socket.IO Events Map](#6-socketio-events-map)
7. [REST API Endpoints](#7-rest-api-endpoints)
8. [Hệ Thống Camera](#8-hệ-thống-camera)
9. [Hệ Thống Overlay & Layer](#9-hệ-thống-overlay--layer)
10. [Hệ Thống Quay Video](#10-hệ-thống-quay-video)
11. [Quản Lý Phòng Chụp (Room)](#11-quản-lý-phòng-chụp-room)
12. [Đa Ngôn Ngữ (i18n)](#12-đa-ngôn-ngữ-i18n)
13. [Bugs & Vấn Đề Đã Biết](#13-bugs--vấn-đề-đã-biết)
14. [Tính Năng Thiếu / Chưa Triển Khai](#14-tính-năng-thiếu--chưa-triển-khai)
15. [Dependencies & Thư Viện](#15-dependencies--thư-viện)
16. [Bảng Tổng Kết Tính Năng](#16-bảng-tổng-kết-tính-năng)

---

## 1. Tổng Quan Kiến Trúc

Hệ thống PhotoBooth gồm **2 ứng dụng độc lập** giao tiếp qua **Socket.IO WebSocket**:

```
┌──────────────────────────────────────────────────────┐
│                    APP CLIENT                         │
│              (Electron Desktop App)                   │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Main Process│  │  Renderer    │  │  Camera      │ │
│  │  (main.js)  │◄─┤ (renderer.  │  │  Controller  │ │
│  │             │  │  html + js)  │  │ (camera-     │ │
│  │  - IPC Hub  │  │             │  │  helper.js)  │ │
│  │  - Socket.IO│  │  - UI       │  │             │ │
│  │  - Express  │  │  - Webcam   │  │  - gphoto2  │ │
│  │    :9999    │  │  - Config   │  │  - DSLR     │ │
│  └──────┬──────┘  └──────────────┘  └─────────────┘ │
│         │ Socket.IO Client                           │
└─────────┼────────────────────────────────────────────┘
          │ WebSocket
          ▼
┌──────────────────────────────────────────────────────┐
│                    APP SERVER                         │
│           (Express + Socket.IO Server)                │
│                Port: 3000                             │
│                                                      │
│  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │  server.js   │  │  Public Web Pages             │  │
│  │              │  │                                │  │
│  │  - REST API  │  │  index.html   (Trang chủ)     │  │
│  │  - Socket.IO │  │  admin.html   (Quản trị)      │  │
│  │  - Multer    │  │  room.html    (Live View)      │  │
│  │  - Sharp     │  │  download.html (Album ảnh)     │  │
│  │  - FFmpeg    │  │                                │  │
│  └──────────────┘  └──────────────────────────────┘  │
│                                                      │
│  rooms.json        (Database JSON file)              │
│  uploads/          (Overlays, Photos, Layers, Videos)│
└──────────────────────────────────────────────────────┘
```

### Mô hình giao tiếp

| Kênh | Giữa | Giao thức |
|------|-------|-----------|
| IPC (Inter-Process Communication) | Main ↔ Renderer (Electron) | Electron IPC |
| WebSocket | Client ↔ Server | Socket.IO |
| HTTP REST | Browser ↔ Server | Express REST |
| MJPEG Stream | Client Express ↔ Local Browser | HTTP multipart |
| USB/PTP | Main Process ↔ Camera DSLR | gphoto2 CLI |
| MediaDevices API | Renderer ↔ System Webcam | WebRTC getUserMedia |

---

## 2. Cấu Trúc Thư Mục

```
PhotoBooth/
├── App client/                      # Electron Desktop Application
│   ├── main.js                      # Main process - IPC hub, Socket.IO, Express :9999
│   ├── preload.js                   # Context bridge (Main ↔ Renderer security)
│   ├── renderer.html                # Dashboard UI (HTML + CSS)
│   ├── renderer.js                  # Dashboard logic (webcam, config, logs)
│   ├── camera-helper.js             # CameraController class (gphoto2 wrapper)
│   ├── mock-server.js               # Mock cloud server cho development
│   ├── package.json                 # Electron + dependencies
│   ├── sample_overlay.png           # Auto-generated sample overlay
│   ├── tray_icon.png                # System tray icon
│   ├── received_photos/             # Photos nhận từ mock server
│   └── node_modules/
│
├── App server/                      # Cloud Server Application
│   ├── server.js                    # Express + Socket.IO server (port 3000)
│   ├── rooms.json                   # JSON database cho rooms
│   ├── package.json                 # Server dependencies
│   ├── node_modules/
│   └── public/                      # Static web pages
│       ├── index.html               # Landing page - nhập tên phòng
│       ├── admin.html               # Admin panel - quản lý phòng chụp
│       ├── room.html                # Live view + chụp ảnh/quay video
│       ├── download.html            # Album ảnh + tải về
│       └── uploads/                 # File storage
│           ├── overlays/            # Overlay images (merged + individual)
│           ├── photos/              # Captured photos (per room subfolder)
│           ├── layers/              # Layer files (images + videos)
│           └── videos/              # Temporary video uploads
│
└── SYSTEM_ANALYSIS.md               # File này
```

---

## 3. App Client (Electron Desktop)

### 3.1. main.js — Main Process

**Vị trí:** `App client/main.js` (554 dòng)
**Vai trò:** Trung tâm điều phối toàn bộ App Client

#### Chức năng chính:

| Chức năng | Mô tả |
|-----------|-------|
| **Window Management** | Tạo BrowserWindow, system tray, single instance lock |
| **Config Management** | Load/save `agent_config.json` vào `userData` |
| **Socket.IO Client** | Kết nối tới Cloud Server, nhận lệnh chụp từ xa |
| **Express Server :9999** | MJPEG live view stream cho trình duyệt local |
| **IPC Hub** | Trung chuyển giữa Renderer ↔ CameraController ↔ Server |
| **Image Processing** | Composite ảnh + overlay bằng `sharp` |
| **Tray Icon** | Menu context: Mở panel, chụp ảnh, thoát |

#### Config mặc định:

```javascript
{
  licenseKey: 'DEMO-LICENSE-12345',
  serverUrl: 'http://localhost:3000',
  cameraSource: 'webcam',         // 'webcam' | 'dslr'
  frameOverlayPath: '',
  language: 'vi',
  roomName: 'default-room',
  webcamDeviceId: ''
}
```

#### Luồng xử lý chụp ảnh (`triggerShutterAndProcess()`):

```
1. Nguồn webcam? → IPC 'webcam-capture-trigger' → chờ Promise (timeout 8s)
   Nguồn DSLR?  → cameraController.captureHighResPhoto()

2. Nhận đường dẫn ảnh gốc (photoPath)

3. compositeFrame(photoPath, overlayPath, outputPath)
   → sharp resize ảnh theo kích thước overlay
   → composite overlay lên ảnh
   → Xuất file JPEG

4. Nếu Socket.IO connected:
   → Đọc file → socket.emit('client-upload-photo', { roomName, fileName, imageBuffer })

5. Nếu offline → Lưu local
```

### 3.2. camera-helper.js — CameraController

**Vị trí:** `App client/camera-helper.js` (321 dòng)
**Vai trò:** Wrapper cho gphoto2 CLI, quản lý camera DSLR

#### Class: `CameraController extends EventEmitter`

| Property | Type | Mô tả |
|----------|------|-------|
| `cameraConnected` | boolean | Trạng thái kết nối camera |
| `detectedModel` | string | Tên model camera phát hiện được |
| `isStreaming` | boolean | Đang stream live view |
| `isCapturing` | boolean | Đang trong quá trình chụp |
| `gphoto2Installed` | boolean | gphoto2 CLI có trên PATH |
| `tempDir` | string | `os.tmpdir()/camera-sync-agent/` |

#### Events phát ra:

| Event | Payload | Khi nào |
|-------|---------|--------|
| `camera_connected` | `{ model, port }` | Phát hiện camera mới |
| `camera_disconnected` | — | Camera ngắt kết nối |
| `frame` | `Buffer (JPEG)` | Mỗi frame live view |
| `stream_started` | — | Bắt đầu stream |
| `stream_stopped` | — | Dừng stream |
| `log` | `string` | Thông báo hệ thống |

#### Methods:

| Method | Mô tả |
|--------|-------|
| `initialize()` | Kiểm tra gphoto2 có cài không |
| `startAutoDetect()` | Poll camera mỗi 3 giây |
| `stopAutoDetect()` | Dừng poll |
| `detectCamera()` | `gphoto2 --auto-detect` → parse output |
| `startLiveViewStream()` | Bắt đầu stream (tự chọn macOS/Windows) |
| `stopLiveViewStream()` | Dừng stream |
| `runGPhotoMovieStream()` | macOS & Windows: `gphoto2 --stdout --capture-movie` → parse JPEG SOI/EOI |
| `captureHighResPhoto()` | Pause stream → `gphoto2 --capture-image-and-download` → resume |

#### Function: `compositeFrame(photoPath, frameOverlayPath, outputPath)`

```
1. Đọc metadata overlay → lấy width/height
2. sharp(photo).resize(targetWidth, targetHeight, { fit: 'cover' })
3. sharp(overlay).resize(targetWidth, targetHeight, { fit: 'fill' }).toBuffer()
4. pipeline.composite([{ input: overlayResized, blend: 'over' }])
5. pipeline.toFile(outputPath)
```

### 3.3. preload.js — Context Bridge

**Vị trí:** `App client/preload.js` (23 dòng)
**Vai trò:** Bảo mật — chỉ expose các API cần thiết từ Main → Renderer

#### API exposed qua `window.electronAPI`:

**Listeners (Main → Renderer):**

| API | IPC Channel | Mô tả |
|-----|-------------|-------|
| `onCameraConnected(cb)` | `camera-connected` | Camera kết nối |
| `onCameraDisconnected(cb)` | `camera-disconnected` | Camera ngắt |
| `onServerStatus(cb)` | `server-status` | Trạng thái cloud |
| `onLog(cb)` | `log` | Log messages |
| `onConfig(cb)` | `config` | Nhận config từ main |
| `onWebcamStartStream(cb)` | `webcam-start-stream` | Yêu cầu bắt đầu stream lên cloud |
| `onWebcamStopStream(cb)` | `webcam-stop-stream` | Yêu cầu dừng stream |
| `onWebcamCaptureTrigger(cb)` | `webcam-capture-trigger` | Yêu cầu chụp ảnh webcam |

**Senders (Renderer → Main):**

| API | IPC Channel | Mô tả |
|-----|-------------|-------|
| `updateConfig(config)` | `update-config` | Cập nhật cấu hình |
| `triggerCapture()` | `trigger-capture` | Bấm nút chụp thủ công |
| `sendWebcamFrame(dataUrl)` | `webcam-frame` | Gửi frame webcam lên cloud |
| `sendWebcamCapturedImage(dataUrl)` | `webcam-captured-image` | Gửi ảnh chụp webcam |
| `notifyWebcamConnected()` | `notify-webcam-connected` | Báo webcam đã kết nối |
| `notifyWebcamDisconnected()` | `notify-webcam-disconnected` | Báo webcam đã ngắt |

### 3.4. renderer.html + renderer.js — Dashboard UI

**Vị trí:** `App client/renderer.html` (692 dòng) + `App client/renderer.js` (616 dòng)
**Vai trò:** Giao diện người dùng của Client App

#### UI Layout:

```
┌──────────────────────────────────────────────────┐
│ Header: Logo + Title + Language Selector         │
├────────────────┬─────────────────────────────────┤
│ Sidebar (350px)│ Main Panel                       │
│                │                                  │
│ ┌────────────┐ │ ┌──────────┬──────────┐         │
│ │ Config     │ │ │ Camera   │ Cloud    │         │
│ │ - Source   │ │ │ Status   │ Status   │         │
│ │ - License  │ │ └──────────┴──────────┘         │
│ │ - Server   │ │                                  │
│ │ - Room     │ │ ┌──────────────────────┐        │
│ │ - Overlay  │ │ │   Live View          │        │
│ │            │ │ │   (MJPEG / Webcam)   │        │
│ │ [Save]     │ │ │                      │        │
│ │ [Capture]  │ │ └──────────────────────┘        │
│ └────────────┘ │                                  │
│                │ ┌──────────────────────┐        │
│                │ │ Console Logs (180px) │        │
│                │ └──────────────────────┘        │
└────────────────┴─────────────────────────────────┘
```

#### Webcam xử lý chi tiết:

| Chức năng | Mô tả |
|-----------|-------|
| `startWebcam(deviceId)` | `getUserMedia({ video: { ideal: 1920x1080 } })` |
| `stopWebcam()` | Dừng tracks, thông báo main |
| `startWebcamStreamToCloud()` | Interval 120ms (~8fps), resize 640px, OffscreenCanvas → JPEG 0.5 quality → IPC |
| `stopWebcamStreamToCloud()` | Clear interval |
| Capture trigger | Khi nhận `webcam-capture-trigger` → canvas full res → JPEG 0.9 → IPC |

#### Error handling webcam:

- `NotReadableError` → Webcam bị chiếm quyền bởi app khác
- `NotAllowedError` → Quyền camera bị từ chối
- `NotFoundError` → Không tìm thấy camera
- `OverconstrainedError` → Fallback sang camera mặc định

### 3.5. mock-server.js

**Vị trí:** `App client/mock-server.js` (241 dòng)
**Vai trò:** Server giả lập cho development (không cần App Server)

- Chạy trên port 3000
- Admin panel inline HTML
- Nhận photos upload qua Socket.IO
- Trigger remote capture broadcast
- Lưu ảnh vào `received_photos/`

---

## 4. App Server (Cloud Server)

### 4.1. server.js — Server chính

**Vị trí:** `App server/server.js` (661 dòng)
**Port:** 3000 (configurable via `PORT` env)

#### Cấu trúc thư mục uploads:

```
public/uploads/
├── overlays/     # Overlay images (merged + individual)
├── photos/       # Captured photos
│   └── {roomName}/   # Subfolder per room
├── layers/       # Uploaded layer files
└── videos/       # Temporary video uploads (pre-conversion)
```

#### Memory trackers:

| Object | Type | Mô tả |
|--------|------|-------|
| `roomAgents` | `{ roomName → socketId }` | Socket ID của agent đang phục vụ room |
| `agentRooms` | `{ socketId → roomName }` | Room mà agent đang phục vụ |
| `agentDetails` | `{ socketId → { licenseKey, deviceId, roomName } }` | Chi tiết agent |
| `deviceSockets` | `{ deviceId → socketId }` | Map device → socket |
| `activeViewers` | `{ roomName → count }` | Số viewer đang xem liveview |

#### Database (rooms.json):

```javascript
{
  "room-name": {
    "name": "room-name",
    "overlayUrl": "/uploads/overlays/merged-room-name-timestamp.png",
    "layers": [
      {
        "id": "layer-timestamp-random",
        "type": "image",            // "image" | "video"
        "url": "/uploads/layers/layer-timestamp-random.png",
        "name": "LOGO.png",
        "x": 0.7,                   // Vị trí X (% từ trái)
        "y": -4.7,                  // Vị trí Y (% từ trên)
        "scale": 17.2               // Kích thước (%)
      }
    ],
    "aspectRatio": "3:2",           // 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 1:1
    "autoCaptureInterval": 10,      // Countdown timer (giây)
    "deviceId": "webcam-CD_QUANG",  // Device ID được gán
    "photos": [                     // Danh sách ảnh đã chụp
      "/uploads/photos/room-name/composite_1234567.jpg"
    ]
  }
}
```

#### Aspect Ratio → Dimensions:

| Aspect Ratio | Width | Height |
|-------------|-------|--------|
| 3:2 (mặc định) | 1800 | 1200 |
| 4:3 | 1600 | 1200 |
| 1:1 | 1200 | 1200 |
| 16:9 | 1920 | 1080 |
| 2:3 | 1200 | 1800 |
| 3:4 | 1200 | 1600 |
| 9:16 | 1080 | 1920 |

#### Layer Merging Logic (`mergeImageLayers()`):

```
1. Nếu 0 layers → return ''
2. Nếu 1 layer ở vị trí mặc định (0,0,100%) → return URL trực tiếp
3. Nhiều layers:
   - Tạo canvas trong suốt (RGBA) theo dimensions
   - Lặp từ dưới lên (reverse order) để index 0 ở trên cùng
   - Mỗi layer: resize theo scale%, đặt tại (x%, y%)
   - sharp().composite(compositeList).png().toFile()
4. Return URL file merged
```

### 4.2. index.html — Landing Page

**Vị trí:** `App server/public/index.html` (113 dòng)

- Form nhập tên phòng
- Kiểm tra phòng tồn tại qua `GET /api/rooms-data/{roomName}`
- Redirect đến `/room/{roomName}` nếu hợp lệ
- Link đến Admin Panel

### 4.3. admin.html — Admin Panel

**Vị trí:** `App server/public/admin.html` (846 dòng)

#### Tính năng:

| Tính năng | Mô tả |
|-----------|-------|
| **Tạo/Sửa phòng** | Tên, countdown timer, aspect ratio, device |
| **Layer Management** | Upload, kéo thả sắp xếp, xóa layers |
| **Layer Editor Modal** | Drag-to-move, resize handle, sliders (X, Y, Scale) |
| **Demo Preview** | Xem trước layout layers trước khi lưu |
| **Camera Select** | Dropdown liệt kê devices đang online |
| **Room List** | Cards hiển thị trạng thái, lượt xem, nút Liveview/Album/Sửa/Xóa |
| **Auto Refresh** | `setInterval(5000)` poll `/api/active-devices` + `/api/rooms` |

#### Layer Editor Modal chi tiết:

- **Di chuyển**: Mousedown trên wrapper → track delta → convert to % of container
- **Resize**: Mousedown trên handle góc dưới-phải → delta X → convert to scale %
- **Sliders**: X (-100% → 100%), Y (-100% → 100%), Scale (5% → 300%)
- **Background layers**: Các layer khác hiển thị mờ (opacity: 30%) làm ngữ cảnh

### 4.4. room.html — Live View & Capture

**Vị trí:** `App server/public/room.html` (930 dòng)

#### Tính năng:

| Tính năng | Mô tả |
|-----------|-------|
| **Live View (Agent)** | Canvas render frames từ Socket.IO `server-frame` |
| **Live View (Browser Webcam)** | `<video>` element từ `getUserMedia()` |
| **Chụp ảnh** | Countdown → Flash → Composite trên Canvas → Upload qua Socket.IO |
| **Quay video** | MediaRecorder trên canvas (webcam + overlay layers) → Upload HTTP POST |
| **QR Code** | Tạo QR code link đến trang download |
| **Mode Toggle** | Chuyển đổi Chụp Ảnh / Quay Video |
| **Auto Loop** | Checkbox — tự động chụp lại sau 3s khi nhận ảnh |
| **Camera Source** | Dropdown: Agent App (Local) / Webcam Trình Duyệt |
| **Overlay Rendering** | DOM elements (img/video) đặt absolute trên live view |
| **Composite trên Canvas** | Webcam frame + tất cả layers → JPEG blob → upload |

#### Browser Webcam Capture Flow:

```
1. Tạo canvas composite (dims từ aspect ratio)
2. Draw webcam video frame (object-cover crop)
3. Draw overlay layers (reverse order, tính px từ %)
4. canvas.toBlob('image/jpeg', 0.9)
5. blob.arrayBuffer() → socket.emit('client-upload-photo', { roomName, fileName, imageBuffer })
```

#### Video Recording Flow:

```
1. Tạo record canvas (dims từ aspect ratio)
2. requestAnimationFrame loop: draw webcam + layers mỗi frame
3. recordCanvas.captureStream(30fps) → MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
4. Record 5 giây → hiển thị REC overlay + countdown
5. MediaRecorder.onstop → Blob → FormData → POST /api/upload-video
6. Server nhận WebM → FFmpeg convert → H.264 MP4 → lưu + broadcast 'new-photo'
```

### 4.5. download.html — Album Ảnh

**Vị trí:** `App server/public/download.html` (277 dòng)

#### Tính năng:

| Tính năng | Mô tả |
|-----------|-------|
| **Gallery Grid** | Responsive grid 1-3 cột, hiển thị ảnh/video |
| **Lightbox** | Fullscreen modal với ảnh/video phóng to |
| **Download** | Direct download link cho ảnh/video |
| **Real-time Sync** | Socket.IO `new-photo` → tự động thêm ảnh mới vào gallery |
| **Video Support** | Hiển thị video autoplay loop muted, badge "Video" |
| **Sort** | Ngược thời gian (mới nhất trước) |

---

## 5. Luồng Dữ Liệu Chính

### 5.1. Luồng Chụp Ảnh (Remote — Agent Mode)

```
Browser (room.html)                Server                    Electron Client
      │                              │                              │
      │ socket.emit                  │                              │
      │ ('trigger-capture',          │                              │
      │  roomName)                   │                              │
      │─────────────────────────────>│                              │
      │                              │  emit('server-command-       │
      │                              │  capture', {roomName,        │
      │                              │  overlayUrl})                │
      │                              │─────────────────────────────>│
      │                              │                              │
      │  emit('capture-countdown-   │                              │
      │  started')                   │                              │
      │<─────────────────────────────│                              │
      │                              │                              │
      │  Hiển thị countdown UI       │                              │
      │                              │                              │
      │                              │   1. Download overlay (nếu có)
      │                              │   2. Chụp ảnh (webcam/DSLR)
      │                              │   3. compositeFrame()
      │                              │   4. Đọc file output
      │                              │                              │
      │                              │  emit('client-upload-photo', │
      │                              │  {roomName, fileName,        │
      │                              │   imageBuffer})              │
      │                              │<─────────────────────────────│
      │                              │                              │
      │                              │  Lưu vào disk               │
      │                              │  Cập nhật rooms.json         │
      │                              │                              │
      │  emit('new-photo',           │                              │
      │  {url, fileName})            │                              │
      │<─────────────────────────────│                              │
      │                              │                              │
      │  Hiển thị ảnh mới            │                              │
```

### 5.2. Luồng Chụp Ảnh (Browser Webcam Mode)

```
Browser (room.html)                Server
      │                              │
      │ socket.emit                  │
      │ ('trigger-capture', room)    │
      │─────────────────────────────>│
      │                              │
      │ emit('capture-countdown-     │
      │ started')                    │
      │<─────────────────────────────│
      │                              │
      │ Countdown → Flash            │
      │ Canvas composite             │
      │ (webcam + layers)            │
      │                              │
      │ socket.emit                  │
      │ ('client-upload-photo',      │
      │ {roomName, fileName,         │
      │  imageBuffer})               │
      │─────────────────────────────>│
      │                              │
      │                         Lưu disk
      │                         Update DB
      │                              │
      │ emit('new-photo')            │
      │<─────────────────────────────│
```

### 5.3. Luồng Live View Stream

```
Camera/Webcam                Electron Client              Server              Browser Viewer
     │                            │                         │                        │
     │  frame data                │                         │                        │
     │───────────────────────────>│                         │                        │
     │                            │                         │                        │
     │                    ┌───────┴───────┐                 │                        │
     │                    │               │                 │                        │
     │              Local Express   Socket.IO               │                        │
     │              MJPEG :9999     (if viewers > 0)         │                        │
     │                    │               │                 │                        │
     │                    │               │ emit            │                        │
     │                    │               │ ('client-frame',│                        │
     │                    │               │  {frame})       │                        │
     │                    │               │────────────────>│                        │
     │                    │               │                 │ emit                   │
     │                    │               │                 │ ('server-frame',       │
     │                    │               │                 │  frameBuffer)          │
     │                    │               │                 │──────────────────────> │
     │                    │               │                 │                        │
     │                    │               │                 │              createImageBitmap
     │                    │               │                 │              → canvas.drawImage
```

### 5.4. Luồng On-Demand Streaming

```
Khi viewer đầu tiên vào room:
  Server → Client: emit('start-cloud-stream')
  Client bắt đầu gửi frames

Khi viewer cuối cùng rời room:
  Server → Client: emit('stop-cloud-stream')
  Client dừng gửi frames

→ Tiết kiệm bandwidth khi không ai xem
```

---

## 6. Socket.IO Events Map

### Client → Server

| Event | Payload | Mô tả |
|-------|---------|-------|
| `register-device` | `{ licenseKey, deviceId, roomName }` | Agent đăng ký thiết bị |
| `join-room` | `roomName` | Browser viewer tham gia room |
| `trigger-capture` | `roomName` | Yêu cầu chụp ảnh |
| `client-frame` | `{ roomName, frame: Buffer }` | Frame live view từ agent |
| `client-upload-photo` | `{ roomName, fileName, imageBuffer }` | Upload ảnh đã composite |

### Server → Client (Agent)

| Event | Payload | Mô tả |
|-------|---------|-------|
| `start-cloud-stream` | — | Bắt đầu gửi frames (có viewer) |
| `stop-cloud-stream` | — | Dừng gửi frames (hết viewer) |
| `server-command-capture` | `{ roomName, overlayUrl }` | Lệnh chụp ảnh từ xa |

### Server → Browser Viewer

| Event | Payload | Mô tả |
|-------|---------|-------|
| `camera-status` | `{ connected, model }` | Trạng thái camera |
| `server-frame` | `Buffer (JPEG)` | Frame live view |
| `capture-countdown-started` | — | Bắt đầu countdown |
| `new-photo` | `{ url, fileName }` | Ảnh mới vừa chụp |

### Electron IPC Events

| Direction | Channel | Payload | Mô tả |
|-----------|---------|---------|-------|
| Main → Renderer | `config` | Config object | Đồng bộ config |
| Main → Renderer | `camera-connected` | `{ model, port }` | Camera kết nối |
| Main → Renderer | `camera-disconnected` | — | Camera ngắt |
| Main → Renderer | `server-status` | `{ connected, message }` | Cloud status |
| Main → Renderer | `log` | string | Log message |
| Main → Renderer | `webcam-start-stream` | — | Yêu cầu stream |
| Main → Renderer | `webcam-stop-stream` | — | Dừng stream |
| Main → Renderer | `webcam-capture-trigger` | — | Yêu cầu chụp |
| Renderer → Main | `update-config` | Config object | Cập nhật config |
| Renderer → Main | `trigger-capture` | — | Chụp thủ công |
| Renderer → Main | `webcam-frame` | ArrayBuffer | Frame webcam |
| Renderer → Main | `webcam-captured-image` | dataUrl (base64) | Ảnh chụp webcam |
| Renderer → Main | `notify-webcam-connected` | — | Webcam đã kết nối |
| Renderer → Main | `notify-webcam-disconnected` | — | Webcam đã ngắt |

---

## 7. REST API Endpoints

### Server REST Routes

| Method | Path | Handler | Mô tả |
|--------|------|---------|-------|
| GET | `/` | Static | Landing page (index.html) |
| GET | `/admin.html` | Static | Admin panel |
| GET | `/room/:roomName` | Fallback → room.html | Live view page |
| GET | `/room/:roomName/download` | Fallback → download.html | Album page |
| GET | `/api/rooms` | Handler | Danh sách tất cả rooms + online status |
| GET | `/api/rooms-data/:roomName` | Handler | Chi tiết 1 room |
| GET | `/api/active-devices` | Handler | Danh sách devices đang kết nối |
| POST | `/api/rooms` | Handler + multer | Tạo/cập nhật room |
| POST | `/api/upload-layer` | Handler + multer | Upload file layer |
| POST | `/api/upload-video` | Handler + multer | Upload video WebM → convert MP4 |
| DELETE | `/api/rooms/:roomName` | Handler | Xóa room + files |

### POST /api/rooms — Chi tiết

**Content-Type:** `application/json` hoặc `multipart/form-data`

**Body:**

| Field | Type | Mô tả |
|-------|------|-------|
| `roomName` | string (required) | Tên phòng (auto lowercase + trim) |
| `autoCaptureInterval` | number | Countdown timer (giây) |
| `aspectRatio` | string | "3:2", "4:3", "1:1", etc. |
| `deviceId` | string | Device ID để gán camera |
| `layers` | JSON array | Danh sách layers |
| `overlay` | file | Legacy overlay upload |

**Response:** `{ success: true, room: { ... } }`

---

## 8. Hệ Thống Camera

### 8.1. DSLR Camera (qua gphoto2)

**Cơ chế hoạt động:**

```
1. KIỂM TRA: exec('where gphoto2') → có trên PATH?
2. PHÁT HIỆN: setInterval(3000) → exec('gphoto2 --auto-detect') → parse output
3. LIVE VIEW:
   - macOS & Windows: spawn('gphoto2', ['--stdout', '--capture-movie'])
            → parse JPEG SOI (0xFFD8) / EOI (0xFFD9)
4. CHỤP ẢNH:
   - Pause live view
   - Chờ 600ms (release USB/PTP lock)
   - exec('gphoto2 --capture-image-and-download --filename=...')
   - Chờ 600ms → Resume live view
```

**Hạn chế:**
- gphoto2 **không chính thức hỗ trợ Windows**
- Chỉ 1 process có thể truy cập camera cùng lúc
- Không thể chụp ảnh khi đang stream (phải pause)

### 8.2. Webcam (Electron App)

**Cơ chế:**

```
1. navigator.mediaDevices.getUserMedia({ video: { ideal: 1920x1080 } })
2. Hiển thị trên <video> element
3. Stream lên cloud: setInterval(120ms)
   → OffscreenCanvas 640px → JPEG 0.5 quality → IPC → Socket.IO
4. Chụp ảnh: canvas full resolution → JPEG 0.9 → IPC 'webcam-captured-image'
```

### 8.3. Webcam (Browser trên room.html)

**Cơ chế:**

```
1. Giống Electron webcam nhưng chạy trong browser thường
2. Composite trực tiếp trên canvas (không cần IPC)
3. Upload qua Socket.IO hoặc HTTP POST
```

---

## 9. Hệ Thống Overlay & Layer

### 9.1. Kiến trúc Layer

Mỗi room có mảng `layers[]`, mỗi layer gồm:

| Property | Type | Mô tả |
|----------|------|-------|
| `id` | string | Unique ID (format: `layer-{timestamp}-{random}`) |
| `type` | `"image"` \| `"video"` | Loại media |
| `url` | string | URL tương đối (ví dụ: `/uploads/layers/layer-xxx.png`) |
| `name` | string | Tên file gốc |
| `x` | number | Vị trí X (% từ trái, -100 → 100) |
| `y` | number | Vị trí Y (% từ trên, -100 → 100) |
| `scale` | number | Kích thước (%, 5 → 300) |

### 9.2. Rendering Pipeline

**Trên Admin (Demo Preview):**
```
layers[] → DOM elements (img/video) → CSS absolute positioning
→ Cùng logic cho cả demo box và modal editor
```

**Trên Room (Live View):**
```
layers[] → DOM elements trên liveview-layers-container (CSS absolute)
→ pointer-events: none (không chặn tương tác)
→ z-index: layersState.length - index (index 0 = trên cùng)
```

**Trên Room (Capture Composite):**
```
Canvas 2D:
1. drawImage(webcamVideo, ...) — crop theo aspect ratio
2. Loop layers (reverse order):
   → Tính px từ %: leftPx = targetW * (xPercent / 100)
   → drawImage(img/video, leftPx, topPx, layerW, layerH)
3. canvas.toBlob('image/jpeg', 0.9)
```

**Trên Server (Merge cho Agent download):**
```
sharp:
1. Tạo canvas transparent (width x height theo aspect ratio)
2. Loop layers (reverse order):
   → sharp(file).resize(layerWidth, layerHeight).toBuffer()
   → compositeList.push({ input, top, left })
3. sharp({ create: transparent }).composite(compositeList).png().toFile()
4. Return URL của file merged
```

### 9.3. Legacy Overlay Support

- Nếu room cũ chỉ có `overlayUrl` mà không có `layers[]`:
  → Tự động convert sang layers format khi load
  ```javascript
  rooms[name].layers = [{
    id: 'legacy-' + name + '-' + Date.now(),
    type: 'image',
    url: rooms[name].overlayUrl,
    name: 'Khung Viền Mặc Định'
  }];
  ```

---

## 10. Hệ Thống Quay Video

### 10.1. Hiện trạng hỗ trợ

| Nguồn | Chụp ảnh | Quay video |
|-------|----------|------------|
| DSLR (gphoto2) | ✅ | ❌ |
| Webcam (Electron) | ✅ | ❌ |
| Webcam (Browser room.html) | ✅ | ✅ |

### 10.2. Video Recording Flow (Browser Webcam — room.html)

```
1. User bấm "Quay Video Ngay" (chỉ khi ở Browser Webcam mode)
2. Socket.IO emit('trigger-capture') → Server emit('capture-countdown-started')
3. Countdown (N giây) → Hết → startLocalVideoRecording()

4. Tạo record canvas (aspect ratio dimensions)
5. requestAnimationFrame loop:
   - drawImage(webcamVideo, ...) với object-cover crop
   - drawImage(overlay layers) — reverse order
6. recordCanvas.captureStream(30fps)
7. MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
8. mediaRecorder.start()

9. Hiển thị REC overlay + countdown 5 giây
10. Sau 5 giây → mediaRecorder.stop()
11. Blob('video/webm') → FormData → POST /api/upload-video

12. Server:
    - multer lưu WebM tạm
    - FFmpeg: ffmpeg -y -i input.webm -c:v libx264 -pix_fmt yuv420p -an output.mp4
    - Xóa file WebM tạm
    - Lưu MP4 vào /uploads/photos/{room}/
    - Cập nhật rooms.json
    - Socket.IO emit('new-photo', { url, fileName })
```

---

## 11. Quản Lý Phòng Chụp (Room)

### 11.1. Device-Room Assignment

```
syncAgentRooms():
1. Load rooms.json
2. Với mỗi agent đang kết nối:
   → Tìm room có rooms[name].deviceId === agent.deviceId
   → Nếu tìm thấy → gán agent vào room đó
   → Nếu không → dùng legacyRoomName (từ register-device)
3. Quản lý Socket.IO rooms: leave cũ, join mới
4. Emit 'camera-status' { connected: true } tới viewers
```

### 11.2. Room Lifecycle

```
TẠO:
Admin → POST /api/rooms → Lưu rooms.json → syncAgentRooms()

SỬA:
Admin → POST /api/rooms (cùng tên) → Merge data → Lưu → syncAgentRooms()
→ Xóa file overlay merged cũ nếu có

XÓA:
Admin → DELETE /api/rooms/:name → Xóa file overlay + thư mục ảnh → Lưu rooms.json
```

### 11.3. Viewer Lifecycle

```
Browser vào /room/xxx:
1. socket.emit('join-room', roomName)
2. activeViewers[room]++
3. Server gửi camera-status
4. Nếu viewer đầu tiên → emit('start-cloud-stream') tới agent

Browser rời trang:
1. socket.disconnect
2. activeViewers[room]--
3. Nếu viewer cuối → emit('stop-cloud-stream') tới agent
```

---

## 12. Đa Ngôn Ngữ (i18n)

**Chỉ có trong Electron Client** (`renderer.js`)

### Ngôn ngữ hỗ trợ: Tiếng Việt (vi) + English (en)

### Cơ chế:

1. HTML elements có attribute `data-i18n="key"`
2. `translateUI(lang)` → querySelectorAll `[data-i18n]` → set textContent
3. Placeholders translate riêng
4. Log messages từ Main process translate inline

### Keys (33 keys):

```
appTitle, appSubtitle, configTitle, camSourceLabel, webcamDeviceLabel,
licenseLabel, licensePlaceholder, serverLabel, serverPlaceholder,
roomLabel, roomPlaceholder, overlayLabel, overlayPlaceholder, overlayDesc,
applyBtn, captureBtn, cameraLabel, cloudLabel, liveviewTitle,
liveviewPlaceholderTitle, liveviewPlaceholderDesc, logsTitle, clearLogsBtn,
logStart, disconnected, connected, offline, connectingError,
logApplyingConfig, logLogsCleared, logDashboardLoaded
```

**Lưu ý:** Các trang web server (admin, room, download) chỉ có tiếng Việt, không hỗ trợ đa ngôn ngữ.

---

## 13. Bugs & Vấn Đề Đã Biết

### BUG 1: Biến undefined trong POST /api/rooms

**File:** `App server/server.js` dòng 352 & 404
**Mức độ:** 🔴 Critical — Room creation có thể crash

```javascript
// Dòng 352 — aspectRatio chưa được khai báo từ req.body
const finalAspectRatio = aspectRatio || existingRoom.aspectRatio || '3:2';

// Dòng 404 — autoCaptureInterval cũng chưa khai báo
autoCaptureInterval: parseInt(autoCaptureInterval, 10) || 10,
```

**Fix cần thiết:**
```javascript
// Thêm trước dòng 352:
const { aspectRatio, autoCaptureInterval } = req.body;
```

**Giải thích tại sao vẫn chạy:** Khi `aspectRatio` là `undefined`, JavaScript đánh giá `undefined || existingRoom.aspectRatio || '3:2'` → fallback hoạt động. Tuy nhiên khi tạo room mới, `existingRoom.aspectRatio` cũng undefined → luôn dùng `'3:2'` mặc định, bỏ qua giá trị admin đã chọn.

### BUG 2: Admin gửi JSON nhưng server expect form-data

**File:** `App server/public/admin.html` dòng 518 + `server.js` dòng 329

Admin gửi:
```javascript
fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(bodyData)
});
```

Server route:
```javascript
app.post('/api/rooms', upload.single('overlay'), async (req, res) => {
  // multer middleware chạy trước → req.body sẽ vẫn hoạt động
  // với JSON body vì có express.json() middleware
});
```

**Trạng thái:** Hoạt động vì `express.json()` middleware parse body trước multer, nhưng middleware `upload.single('overlay')` chạy thừa.

### ISSUE 3: gphoto2 trên Windows

- gphoto2 không chính thức hỗ trợ Windows
- Phải cài qua MSYS2/Cygwin hoặc build từ source
- Nhiều DSLR models không hoạt động trên Windows qua gphoto2
- **Recommendation:** Trên Windows, chỉ nên dùng chế độ Webcam

### ISSUE 4: Memory leak tiềm ẩn

- `liveviewClients` array trong main.js chỉ cleanup khi client disconnect
- Nếu Express MJPEG client disconnect bất thường → có thể leak
- Webcam `OffscreenCanvas` tạo mới khi null nhưng không bao giờ dispose

### ISSUE 5: Single-threaded sharp processing

- `compositeFrame()` và `mergeImageLayers()` chạy synchronous trên main thread
- Với ảnh lớn hoặc nhiều layers → có thể block event loop
- Recommendation: Xem xét dùng worker threads cho image processing

---

## 14. Tính Năng Thiếu / Chưa Triển Khai

| Tính năng | Mức ưu tiên | Ghi chú |
|-----------|-------------|---------|
| Quay video từ DSLR | Thấp | gphoto2 hạn chế, cần SDK riêng |
| Quay video từ Webcam Electron | Trung bình | Cần thêm MediaRecorder vào renderer.js |
| Điều khiển xoay camera vật lý (PTZ) | Thấp | Không nằm trong scope gphoto2 |
| Xoay ảnh (rotation) trước composite | Trung bình | EXIF orientation chưa xử lý rõ ràng |
| Authentication / Login | Cao | Admin panel không có auth |
| HTTPS / SSL | Trung bình | Đang chạy HTTP thuần |
| Rate limiting | Trung bình | Không có throttle cho uploads |
| Backup & Export photos | Thấp | Chỉ có download từng ảnh |
| Batch download (ZIP) | Trung bình | Chưa có tải album ZIP |
| Print ảnh trực tiếp | Trung bình | Chưa hỗ trợ print |
| History / Undo layers | Thấp | Layer editor không có undo |
| Đa ngôn ngữ cho web pages | Thấp | Chỉ có tiếng Việt |
| Mobile responsive (room.html) | Cao | Layout cố định, chưa responsive |
| Watermark tùy chỉnh | Thấp | Dùng layer system thay thế |

---

## 15. Dependencies & Thư Viện

### App Client (Electron)

| Package | Version | Vai trò |
|---------|---------|---------|
| `electron` | ^31.0.0 | Desktop app framework |
| `express` | ^4.19.2 | Local MJPEG streaming server |
| `cors` | ^2.8.5 | CORS middleware |
| `sharp` | ^0.33.4 | Image processing & compositing |
| `socket.io` | ^4.7.5 | (unused — có thể xóa) |
| `socket.io-client` | ^4.7.5 | WebSocket client kết nối server |
| `dotenv` | ^16.4.5 | Environment variables (unused) |

### App Server

| Package | Version | Vai trò |
|---------|---------|---------|
| `express` | ^4.19.2 | HTTP server + REST API |
| `socket.io` | ^4.7.5 | WebSocket server |
| `cors` | ^2.8.5 | CORS middleware |
| `multer` | ^1.4.5 | File upload handling |
| `sharp` | ^0.35.2 | Layer merging & image processing |

### External Tools (không trong package.json)

| Tool | Vai trò | Required? |
|------|---------|-----------|
| `gphoto2` | DSLR camera control CLI | Chỉ cần nếu dùng DSLR |
| `ffmpeg` | Video format conversion (WebM → MP4) | Chỉ cần nếu quay video |

### CDN Dependencies (Web Pages)

| Library | Dùng trong | Vai trò |
|---------|-----------|---------|
| Tailwind CSS (CDN) | admin, room, download, index | CSS framework |
| Inter (Google Fonts) | Toàn bộ | Typography |
| Fira Code (Google Fonts) | Electron client | Monospace font cho logs |
| QRCode.js (CDN) | room.html | Generate QR code |
| Socket.IO Client (served) | admin, room, download | WebSocket client |

---

## 16. Bảng Tổng Kết Tính Năng

| Tính năng | Electron Client | Browser (room.html) | Trạng thái |
|-----------|:-:|:-:|:---:|
| Kết nối DSLR (gphoto2) | ✅ | — | Hoạt động |
| Kết nối Webcam | ✅ | ✅ | Hoạt động |
| Chọn camera device | ✅ | ✅ | Hoạt động |
| Live View (DSLR) | ✅ | ✅ (qua cloud) | Hoạt động |
| Live View (Webcam) | ✅ | ✅ | Hoạt động |
| Chụp ảnh | ✅ | ✅ | Hoạt động |
| Overlay composite | ✅ (sharp) | ✅ (canvas) | Hoạt động |
| Multi-layer overlay | ✅ | ✅ | Hoạt động |
| Remote capture (từ xa) | ✅ | ✅ | Hoạt động |
| Upload ảnh lên server | ✅ | ✅ | Hoạt động |
| Countdown timer | ✅ | ✅ | Hoạt động |
| Flash + Shutter sound | — | ✅ | Hoạt động |
| Auto-loop chụp | — | ✅ | Hoạt động |
| Quay video | ❌ | ✅ | Chỉ Browser |
| QR Code download | — | ✅ | Hoạt động |
| Album ảnh gallery | — | ✅ (download.html) | Hoạt động |
| Lightbox xem ảnh lớn | — | ✅ | Hoạt động |
| Quản lý phòng (CRUD) | — | ✅ (admin.html) | Hoạt động |
| Layer editor (drag/resize) | — | ✅ (admin.html) | Hoạt động |
| Device assignment | — | ✅ (admin.html) | Hoạt động |
| Aspect ratio config | — | ✅ | Hoạt động |
| Đa ngôn ngữ (VI/EN) | ✅ | ❌ | Chỉ Client |
| On-demand streaming | ✅ | — | Hoạt động |
| System tray | ✅ | — | Hoạt động |
| Single instance lock | ✅ | — | Hoạt động |
| Real-time photo sync | — | ✅ | Hoạt động |

---

*Tài liệu này được tạo tự động từ phân tích mã nguồn. Cập nhật khi có thay đổi lớn trong hệ thống.*
