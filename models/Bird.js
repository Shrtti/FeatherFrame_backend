const mongoose = require('mongoose');

const birdSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  scientificName: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  region: {
    type: String,
    required: true,
    trim: true
  },
  species: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  spottedAt: {
    type: Date,
    required: true
  },
  aiIdentified: {
    type: Boolean,
    default: false
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
birdSchema.index({ region: 1, species: 1 });
birdSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Bird', birdSchema);