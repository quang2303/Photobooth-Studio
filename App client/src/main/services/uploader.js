const fs = require('fs');
const path = require('path');

async function downloadFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
}

async function uploadLocalVideo(videoPath, roomName, serverUrl, logCallback = () => {}) {
  try {
    logCallback(`Uploading recorded video file: ${videoPath}`);
    const fileBuffer = await fs.promises.readFile(videoPath);
    const blob = new Blob([fileBuffer], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('video', blob, path.basename(videoPath));
    formData.append('roomName', roomName || 'default-room');

    const uploadUrl = `${serverUrl.replace(/\/$/, '')}/api/upload-video`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      logCallback(`Video uploaded successfully: ${result.url}`);
      // Clean up local video file
      try {
        fs.unlinkSync(videoPath);
      } catch (e) {}
      return { success: true, url: result.url };
    } else {
      const errText = await response.text();
      logCallback(`Failed to upload video to server: ${errText}`);
      return { success: false, error: errText };
    }
  } catch (err) {
    logCallback(`Error uploading local video: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  downloadFile,
  uploadLocalVideo
};
