const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
  photoId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  localPath: {
    type: String,
    default: ''
  },
  googleDriveFileId: {
    type: String,
    default: ''
  },
  webViewLink: {
    type: String,
    default: ''
  },
  downloadLink: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Photo', PhotoSchema);
