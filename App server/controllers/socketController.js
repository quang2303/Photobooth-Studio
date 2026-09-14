const path = require('path');
const Room = require('../models/Room');
const storageService = require('../services/storageService');

const publicDir = path.join(__dirname, '..', 'public');
const localPhotosDir = path.join(publicDir, 'uploads', 'photos');

// Memory trackers for live WebSocket state
let io = null;
const roomAgents = {}; // roomName -> socket.id
const agentRooms = {}; // socket.id -> roomName
const agentDetails = {}; // socket.id -> { licenseKey, deviceId, roomName }
const deviceSockets = {}; // deviceId -> socket.id
const activeViewers = {}; // roomName -> count

function init(ioInstance) {
  io = ioInstance;
  
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // 1. Client Agent Registration
    socket.on('register-device', async (data) => {
      const { licenseKey, deviceId, roomName } = data;
      const normalizedRoomName = (roomName || 'default-room').toLowerCase().trim();
      const ip = (socket.handshake.address || '').replace('::ffff:', '');
      console.log(`Agent registered device: licenseKey=${licenseKey}, deviceId=${deviceId}, roomName=${normalizedRoomName}, ip=${ip}`);
      
      deviceSockets[deviceId] = socket.id;
      agentDetails[socket.id] = { 
        licenseKey, 
        deviceId, 
        legacyRoomName: normalizedRoomName,
        roomName: normalizedRoomName,
        ip
      };
      
      await syncAgentRooms();
      
      const activeRoom = agentRooms[socket.id];
      if (activeRoom) {
        const viewers = activeViewers[activeRoom] || 0;
        if (viewers > 0) {
          socket.emit('start-cloud-stream');
        }
      }
    });

    // 2. Web Viewer (Browser) joins a Room
    socket.on('join-room', (roomNameRaw) => {
      const roomName = (roomNameRaw || '').toLowerCase().trim();
      socket.join(roomName);
      console.log(`Web viewer joined room: ${roomName}`);

      activeViewers[roomName] = (activeViewers[roomName] || 0) + 1;

      // Send camera connection status to this new viewer
      const agentSocketId = roomAgents[roomName];
      if (agentSocketId && agentDetails[agentSocketId]) {
        socket.emit('camera-status', {
          connected: true,
          model: agentDetails[agentSocketId].deviceId
        });
        
        if (activeViewers[roomName] === 1) {
          io.to(agentSocketId).emit('start-cloud-stream');
        }
      } else {
        socket.emit('camera-status', { connected: false });
      }

      socket.roomJoined = roomName;
    });

    // 3. Web Viewer triggers Capture command (kept for legacy support or browser clients)
    socket.on('trigger-capture', async (roomNameRaw) => {
      const roomName = (roomNameRaw || '').toLowerCase().trim();
      console.log(`Socket Triggered capture requested for room: ${roomName}`);
      
      try {
        const room = await Room.findOne({ name: roomName });
        const countdownDuration = room ? room.autoCaptureInterval : 10;
        const overlayUrl = room ? room.overlayUrl : '';
        triggerCaptureRemote(roomName, 'photo', countdownDuration, overlayUrl);
      } catch (err) {
        console.error('Error in socket trigger-capture:', err);
      }
    });

    // 4. Client Agent streams liveview frame to cloud
    socket.on('client-frame', (data) => {
      const { frame } = data;
      const roomName = (agentRooms[socket.id] || data.roomName || '').toLowerCase().trim();
      if (roomName) {
        socket.to(roomName).emit('server-frame', frame);
      }
    });

    // 5. Client Agent uploads completed composite photo
    socket.on('client-upload-photo', async (data) => {
      const { fileName, imageBuffer, googleDriveInfo } = data;
      const roomName = (agentRooms[socket.id] || data.roomName || '').toLowerCase().trim();
      if (!roomName) return;

      console.log(`Received photo upload for room: ${roomName}, file: ${fileName} (${imageBuffer ? imageBuffer.length : 0} bytes)`);

      try {
        const photo = await storageService.savePhoto(imageBuffer, fileName, roomName, googleDriveInfo);
        const photoUrl = `/photo/raw/${photo.photoId}`;
        
        const room = await Room.findOne({ name: roomName });
        if (room) {
          room.photos.push(photoUrl);
          await room.save();
        }

        broadcastNewPhoto(roomName, photoUrl, fileName, photo.photoId, photo.downloadLink, photo.webViewLink);
        console.log(`Photo saved and broadcasted successfully: ${photoUrl} (photoId: ${photo.photoId})`);
      } catch (err) {
        console.error(`Failed to save uploaded photo for room ${roomName}:`, err);
      }
    });

    // 6. Handle Disconnection
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);

      const details = agentDetails[socket.id];
      if (details) {
        const { deviceId, roomName } = details;
        console.log(`Camera Client Agent disconnected: deviceId=${deviceId}, roomName=${roomName}`);
        delete deviceSockets[deviceId];
        delete agentDetails[socket.id];
        delete agentRooms[socket.id];
        if (roomAgents[roomName] === socket.id) {
          delete roomAgents[roomName];
        }

        io.to(roomName).emit('camera-status', { connected: false });
      }

      if (socket.roomJoined) {
        const room = socket.roomJoined;
        activeViewers[room] = Math.max(0, (activeViewers[room] || 0) - 1);
        console.log(`Web viewer disconnected from room: ${room}. Active viewers: ${activeViewers[room]}`);

        if (activeViewers[room] === 0) {
          const agentSocketId = roomAgents[room];
          if (agentSocketId) {
            io.to(agentSocketId).emit('stop-cloud-stream');
          }
        }
      }
    });
  });
}

async function syncAgentRooms() {
  if (!io) return;
  try {
    const rooms = await Room.find({});
    
    for (const name in roomAgents) {
      delete roomAgents[name];
    }
    
    for (const socketId in agentDetails) {
      const details = agentDetails[socketId];
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) continue;
      
      let assignedRoomName = null;
      for (const room of rooms) {
        if (room.deviceId === details.deviceId) {
          assignedRoomName = room.name;
          break;
        }
      }
      
      const targetRoom = assignedRoomName || details.legacyRoomName;
      
      roomAgents[targetRoom] = socketId;
      agentRooms[socketId] = targetRoom;
      details.roomName = targetRoom;
      
      const currentRooms = Array.from(socket.rooms);
      currentRooms.forEach(r => {
        if (r !== socketId && r !== targetRoom) {
          socket.leave(r);
        }
      });
      socket.join(targetRoom);
      
      io.to(targetRoom).emit('camera-status', { connected: true, model: details.deviceId });
    }
  } catch (err) {
    console.error('Error syncing agent rooms:', err);
  }
}

function triggerCaptureRemote(roomName, mode, countdownDuration, overlayUrl, action) {
  if (!io) return;
  
  if (mode === 'video') {
    io.to(roomName).emit('video-recording-command', { action });
  } else {
    io.to(roomName).emit('capture-countdown-started', { mode });
    
    const agentSocketId = roomAgents[roomName];
    if (agentSocketId && mode === 'photo') {
      setTimeout(() => {
        const currentAgentSocketId = roomAgents[roomName];
        if (currentAgentSocketId) {
          io.to(currentAgentSocketId).emit('server-command-capture', {
            roomName,
            overlayUrl
          });
        }
      }, countdownDuration * 1000);
    }
  }
}

function broadcastNewPhoto(roomName, photoUrl, filename, photoId, downloadLink = '', webViewLink = '') {
  if (!io) return;
  io.to(roomName).emit('new-photo', {
    url: photoUrl,
    fileName: filename,
    photoId: photoId,
    downloadLink: downloadLink,
    webViewLink: webViewLink,
    publicBaseUrl: process.env.PUBLIC_BASE_URL || ''
  });
}

module.exports = {
  init,
  getRoomAgents: () => roomAgents,
  getAgentRooms: () => agentRooms,
  getAgentDetails: () => agentDetails,
  getActiveViewers: () => activeViewers,
  syncAgentRooms,
  triggerCaptureRemote,
  broadcastNewPhoto
};
