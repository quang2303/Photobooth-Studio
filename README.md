# 📸 PhotoBooth Studio Cloud & Camera Sync Agent

[![Release](https://img.shields.io/github/v/release/quang2303/Photobooth-Studio?color=rose&label=Latest%20Release)](https://github.com/quang2303/Photobooth-Studio/releases)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-v31-blue.svg)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](#)

Hệ thống **PhotoBooth Studio** chuyên nghiệp dành cho sự kiện và phòng chụp ảnh tự động. Hỗ trợ kết nối máy ảnh chuyên nghiệp (Canon EOS EDSDK, Sony Alpha, System Webcam), đồng bộ luồng Live View thời gian thực, thiết kế khung ảnh đa dạng (Frame Studio) và tự động tạo mã QR tải ảnh qua Google Drive / Cloud Server.

---

## 📥 Tải Về Bản Đóng Gói Mới Nhất (Executable Releases)

Bạn có thể tải ngay file thực thi dành cho Windows tại **[Trang GitHub Releases](https://github.com/quang2303/Photobooth-Studio/releases)**:

| File cài đặt | Loại | Dung lượng | Thích hợp cho |
|---|---|---|---|
| 📦 **[CameraSyncAgent Setup 1.0.0.exe](https://github.com/quang2303/Photobooth-Studio/releases/download/v1.0.0/CameraSyncAgent.Setup.1.0.0.exe)** | NSIS Installer | `~106 MB` | Cài đặt chính thức lên máy tính |
| 🚀 **[CameraSyncAgent 1.0.0.exe](https://github.com/quang2303/Photobooth-Studio/releases/download/v1.0.0/CameraSyncAgent.1.0.0.exe)** | Portable | `~106 MB` | Chạy trực tiếp không cần cài đặt |

---

## 📁 Cấu Trúc Dự Án

```
Photobooth-Studio/
├── App server/          # Cloud Server (Express + Socket.io + MongoDB Atlas)
│   ├── server.js        # Entry point chính
│   ├── config/          # Cấu hình kết nối DB
│   ├── controllers/     # Quản lý phòng chụp, Socket.io, API
│   ├── models/          # Schema MongoDB (Room, Layer, Photo)
│   ├── services/        # Service xử lý ghép ảnh & Google Drive
│   └── public/          # Giao diện web (Admin, Room Live View, Download)
│
├── App client/          # Camera Sync Agent (Electron Desktop App)
│   ├── main.js          # Electron Main process & IPC router
│   ├── kiosk.html       # Màn hình Kiosk Live View dành cho khách hàng
│   ├── renderer.html    # Bảng điều khiển Agent chuyên nghiệp
│   ├── bridges/canon/   # Canon EDSDK C# Native Bridge (CanonBridge.exe)
│   └── src/             # Modules xử lý camera, frame manager & google drive
│
└── README.md            # Tài liệu hướng dẫn sử dụng & cài đặt
```

---

## ⚡ Tính Năng Nổi Bật

- 📷 **Đa Nguồn Camera**: Hỗ trợ Canon EOS DSLR qua EDSDK C# Native Bridge, System Webcam và Sony Alpha.
- 🖼️ **Bộ Thiết Kế Frame Studio**: Tùy biến layer (logo, khung viền, watermark), di chuyển tọa độ X/Y, phóng to/thu nhỏ và chọn tỷ lệ khung hình (`3:2`, `4:3`, `1:1`, `2:3`, `3:4`, `9:16`, `16:9`).
- 📺 **Màn Hình Kiosk Độc Lập**: Màn hình xem trực tiếp tự động co giãn theo tỷ lệ khung hình đã chọn, tích hợp đếm ngược chụp ảnh, hiệu ứng Flash studio và màn hình quét QR.
- ☁️ **Đồng Bộ Cloud & Google Drive**: Tự động tải ảnh thành phẩm lên Google Drive, tạo mã QR tức thì cho khách quét tải về điện thoại.
- ⚡ **Ghép Khung Thời Gian Thực**: Ghép layer và tối ưu độ phân giải cao bằng engine `sharp`.

---

## ⚙️ Yêu Cầu Hệ Thống

### 1. Cloud Server (`App server`)
- **Node.js**: v18.0.0 trở lên
- **MongoDB**: MongoDB Atlas hoặc MongoDB Local

### 2. Camera Sync Agent Desktop (`App client`)
- **Hệ điều hành**: Windows 10 / 11 (64-bit)
- **Thiết bị Camera**:
  - Webcam máy tính / USB Webcam
  - Máy ảnh Canon EOS kết nối cáp USB (Hỗ trợ EDSDK)

---

## 🚀 Cài Đặt & Chạy Từ Nguồn (Development)

### 1. Khởi chạy Cloud Server

```bash
cd "App server"
npm install
npm start
```
Server chạy tại: `http://localhost:3000`

### 2. Khởi chạy Camera Sync Agent (Desktop)

```bash
cd "App client"
npm install
npm start
```

### 3. Đóng gói ứng dụng Desktop (Build Executable)

Để đóng gói ra file `.exe` cài đặt và portable:

```bash
cd "App client"
npm run dist
```
Các file thực thi sẽ được xuất ra thư mục `App client/dist/`.

---

## 📖 Hướng Dẫn Sử Dụng Chi Tiết

### 1. Tạo & Thiết Lập Phòng Chụp (Admin Panel)
1. Mở trình duyệt truy cập: `http://localhost:3000/admin.html`
2. Tạo phòng chụp mới và chọn tỷ lệ khung hình (`2:3`, `3:2`, `4:3`, `1:1`, v.v.).
3. Thêm các file Layer khung viền (PNG/JPG) và căn chỉnh vị trí.

### 2. Sử Dụng Camera Sync Agent
1. Mở ứng dụng **CameraSyncAgent** trên máy tính.
2. Chọn nguồn camera (**System Webcam** hoặc **Canon EOS**).
3. Bấm **Thiết Kế Khung Ảnh (Studio)** để chỉnh sửa layer hoặc chọn các mẫu sẵn có.
4. Bấm **Mở Màn Hình Kiosk (F11)** để bật giao diện chụp ảnh cho khách.
5. Khách chạm vào màn hình hoặc ấn phím `Space` để bắt đầu đếm ngược chụp ảnh và nhận mã QR tải về.

---

## 🌐 Đường Dẫn & API Main Points

| Đường dẫn / API | Mô tả |
|---|---|
| `http://localhost:3000` | Trang chủ chọn phòng chụp |
| `http://localhost:3000/admin.html` | Bảng điều khiển Admin |
| `http://localhost:3000/room/<tên-phòng>` | Giao diện Live View trên trình duyệt |
| `http://localhost:3000/room/<tên-phòng>/download` | Trang Album tải ảnh dành cho khách |

---

## 📝 License

Dự án được phát hành theo giấy phép [MIT License](LICENSE).
