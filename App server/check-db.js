require('dotenv').config();
const connectDB = require('./config/db');
const Room = require('./models/Room');

async function checkRooms() {
  console.log('--- KIỂM TRA TRẠNG THÁI DATABASE ROOMS ---');
  await connectDB();

  try {
    const rooms = await Room.find({});
    console.log(`Tìm thấy ${rooms.length} phòng trong Database:`);
    rooms.forEach(room => {
      console.log(`\n- Phòng: "${room.name}"`);
      console.log(`  aspectRatio: "${room.aspectRatio}"`);
      console.log(`  deviceId gán cho phòng: "${room.deviceId || '(Chưa gán)'}"`);
      console.log(`  photos: [${room.photos.length} ảnh]`);
    });
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Lỗi khi truy vấn:', err.message);
    process.exit(1);
  }
}

checkRooms();
