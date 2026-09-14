require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const roomRoutes = require('./routes/roomRoutes');
const socketController = require('./controllers/socketController');
const Room = require('./models/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8 // Allow up to 100MB photo uploads
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public folder
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.use('/uploads', express.static(path.join(publicDir, 'uploads')));

// Mount routes
app.use(roomRoutes);

// Socket.io initialization
socketController.init(io);

// One-time rooms.json migration hook
async function migrateLegacyRooms() {
  const dbPath = path.join(__dirname, 'rooms.json');
  if (fs.existsSync(dbPath)) {
    console.log('Found legacy rooms.json database. Starting migration to MongoDB...');
    try {
      const data = fs.readFileSync(dbPath, 'utf8');
      const legacyRooms = JSON.parse(data);
      
      for (const name in legacyRooms) {
        const legacyRoom = legacyRooms[name];
        const roomName = name.toLowerCase().trim();
        
        let layers = legacyRoom.layers || [];
        if (legacyRoom.overlayUrl && layers.length === 0) {
          layers = [{
            id: 'legacy-' + roomName + '-' + Date.now(),
            type: 'image',
            url: legacyRoom.overlayUrl,
            name: 'Khung Viền Mặc Định'
          }];
        }
        
        await Room.findOneAndUpdate(
          { name: roomName },
          {
            name: roomName,
            overlayUrl: legacyRoom.overlayUrl || '',
            layers: layers,
            aspectRatio: legacyRoom.aspectRatio || '3:2',
            autoCaptureInterval: legacyRoom.autoCaptureInterval || 10,
            deviceId: legacyRoom.deviceId || '',
            photos: legacyRoom.photos || []
          },
          { upsert: true, new: true }
        );
        console.log(`Migrated room: ${roomName}`);
      }
      
      const backupPath = `${dbPath}.bak`;
      fs.renameSync(dbPath, backupPath);
      console.log(`Migration completed successfully! Legacy rooms.json backup saved at: ${backupPath}`);
    } catch (err) {
      console.error('Failed to migrate legacy rooms.json database:', err);
    }
  }
}

// Connect Database and Start Server
async function startServer() {
  await connectDB();
  await migrateLegacyRooms();
  
  socketController.syncAgentRooms();
  
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`PhotoBooth Cloud Server running at http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

startServer();
