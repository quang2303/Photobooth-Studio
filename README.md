# PhotoBooth Camera Sync Agent

A professional desktop application for events, photo studios, and automated Kiosk booths. Features real-time camera live view streaming (Canon EOS EDSDK, Sony Alpha, System Webcams), an intuitive visual Frame Studio editor, Kiosk countdown display, and instant Google Drive QR code generation.

---

## Download Executables (Latest Release)

Download pre-built executables for **Windows 10 / 11 (64-bit)** at **[GitHub Releases Page](https://github.com/quang2303/Photobooth-Studio/releases)**:

| Installer File | Type | File Size | Description |
|---|---|---|---|
| **[CameraSyncAgent Setup 1.0.0.exe](https://github.com/quang2303/Photobooth-Studio/releases/download/v1.0.0/CameraSyncAgent.Setup.1.0.0.exe)** | NSIS Installer | `~106 MB` | Full Windows setup installer |
| **[CameraSyncAgent 1.0.0.exe](https://github.com/quang2303/Photobooth-Studio/releases/download/v1.0.0/CameraSyncAgent.1.0.0.exe)** | Portable | `~106 MB` | Standalone portable executable (No installation required) |

---

## Features

- **Multi-Camera Source Support**: Direct USB integration with Canon EOS (via native EDSDK C# Bridge), Sony Alpha, and System Webcams.
- **Frame Studio Visual Editor**:
  - Layer composition for overlays, watermarks, and logos.
  - Interactive X/Y positioning and Scale controls.
  - Multi-aspect ratio support: `3:2`, `4:3`, `1:1`, `2:3` (Korean Photostrip), `3:4`, `9:16`, `16:9`.
  - Built-in preset templates (K-Cut 4-Frame, Wedding Luxury, Y2K Neon, Vintage Polaroid, Birthday, Studio Pro).
- **Interactive Kiosk Live View**:
  - Fullscreen mirror display tailored for booth subjects.
  - Dynamic aspect-ratio container scaling with automated live view cropping.
  - Interactive countdown timer (3s, 5s, 10s), studio flash effect, sound effects, and QR code result screen.
- **Google Drive & QR Code Integration**:
  - In-app Google Drive OAuth authentication.
  - Instant cloud upload with auto-generated QR code for subjects to download photos directly to mobile phones.
  - Dual storage support (Local Album & Google Drive).

---

## DSLR Camera Setup & Configuration Guide

To ensure fast transfer speeds, zero shutter lag, and stable live view streaming, configure your camera settings as follows before connecting via USB:

### 1. Canon EOS DSLR Configuration (EDSDK USB)

| Setting | Recommended Value | Description / Purpose |
|---|---|---|
| **Mode Dial** | **M (Manual)** or **Av (Aperture Priority)** | Full manual exposure control over shutter speed, aperture, and ISO. |
| **Auto Power-off** | **Disable / Off** | `Menu -> Setup -> Auto power off -> Disable`. Prevents camera from sleeping during operation. |
| **Image Quality** | **JPEG Fine** / **JPEG Large** | **Do NOT use RAW-only (CR2/CR3)**. High-res JPEG ensures rapid USB transfer speeds. |
| **Image Review** | **Off** | `Menu -> Setup -> Image review -> Off`. Eliminates LCD delay after taking a shot. |
| **Focus Mode** | **Manual Focus (MF)** or **One-Shot AF** | Prevents shutter delays caused by continuous autofocus hunting. |
| **Live View Shoot** | **Enable** | `Menu -> Live View shooting -> Enable`. |
| **Release Shutter w/o Card** | **Enable / On** | `Menu -> Setup -> Release shutter w/o card -> Enable`. Allows capturing and transferring photos directly to computer over USB without requiring an SD memory card. |
| **Storage Card** | **Optional (Card or No-Card)** | Supported with or without SD card inserted when "Release shutter w/o card" is enabled. |
| **Power Source** | **AC Adapter / Full Battery** | Use continuous AC power coupler for all-day events. |

### 2. Sony Alpha Configuration (USB PC Remote)

| Setting | Recommended Value | Description / Purpose |
|---|---|---|
| **USB Connection** | **PC Remote** | `Menu -> Network/USB -> USB Connection -> PC Remote`. |
| **PC Remote Save Dest.** | **PC + Camera** or **PC Only** | Saves full resolution photos directly to computer memory. |
| **Auto Power-off Temp.** | **High** | `Menu -> Setup -> Auto Power OFF Temp. -> High`. Prevents thermal shutdown during continuous live view. |
| **Drive Mode** | **Single Shooting** | Ensures single shutter actuation per trigger. |

### 3. System Webcam Configuration

- Connect USB Webcam directly to a USB 3.0 port.
- Select desired device and Live View resolution (`High 1280px` / `Medium 960px` / `Low 640px`) inside the app dashboard.

---

## System Requirements

- **Operating System**: Windows 10 / 11 (64-bit)
- **Processor**: Intel Core i3 / AMD Ryzen 3 or higher
- **RAM**: 4 GB RAM minimum (8 GB recommended)
- **USB**: USB 3.0 / 3.1 Port for camera connection

---

## User Operating Guide

1. **Launch Application**:
   - Run `CameraSyncAgent 1.0.0.exe` (Portable) or install using `CameraSyncAgent Setup 1.0.0.exe`.

2. **Select Camera Source**:
   - Under **Camera Source**, select **System Webcam** or **Canon EOS (Direct EDSDK)**.
   - Verify camera indicator status shows **Connected**.

3. **Customize Frame Layout (Frame Studio)**:
   - Click **Frame Studio**.
   - Select aspect ratio (e.g. `2:3` for Korean photostrip).
   - Add overlay layers or choose a **Preset Template**.
   - Click **Save Frame & Apply**.

4. **Connect Google Drive (Optional)**:
   - Choose Storage Mode: **Local Only**, **Google Drive Only**, or **Both**.
   - Click **Login Google Drive** to authenticate and enable automated QR code generation.

5. **Open Kiosk Screen**:
   - Click **Open Kiosk Screen** (or press `F11`).
   - Subjects tap screen or press `Space` to start countdown and scan QR code upon completion.

---

## License & Usage Restrictions

This project is licensed under the **[Non-Commercial License](https://github.com/quang2303/Photobooth-Studio/blob/main/LICENSE)**:

- **Permitted**: Free for personal, educational, academic, research, and non-profit use.
- **Prohibited**: **Strictly NO commercial use, monetization, paid event services, reselling, or licensing without explicit written permission from the copyright holder (`quang2303`).**

For commercial licensing requests, please contact the author on GitHub: [https://github.com/quang2303](https://github.com/quang2303)
