const mongoose = require('mongoose');

const LayerSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], default: 'image' },
  url: { type: String, required: true },
  name: { type: String, default: '' },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  scale: { type: Number, default: 100 }
});

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, lowercase: true, trim: true },
  overlayUrl: { type: String, default: '' },
  layers: [LayerSchema],
  aspectRatio: { type: String, default: '3:2' },
  autoCaptureInterval: { type: Number, default: 10 },
  deviceId: { type: String, default: '' },
  photos: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
