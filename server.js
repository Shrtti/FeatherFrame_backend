require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { GridFSBucket } = require('mongodb');
const jwt = require('jsonwebtoken');
const Bird = require('./models/Bird');
const User = require('./models/User');
const birdRecognition = require('./services/birdRecognition');
const { findMatchingBirds } = require('./data/birdSpecies');
const auth = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://featherframe.vercel.app',
    'https://feather-frame-vzfe.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const user = new User({ username, email, password });
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ 
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email 
      }, 
      token 
    });
    } catch (error) {
    console.error('Registration error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages[0] });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    res.status(500).json({ error: 'Error creating user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user._id, username: user.username, email: user.email }, token });
  } catch (error) {
    res.status(500).json({ error: 'Error logging in' });
  }
});

// Protected routes
app.post('/api/birds', auth, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { name, description, region, species } = req.body;
    
    const uploadedBirds = [];

    for (const file of req.files) {
      // Create GridFS bucket
      const bucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: 'uploads'
      });

      // Upload file to GridFS
      const filename = `${Date.now()}-${file.originalname}`;
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: {
          originalname: file.originalname,
          mimetype: file.mimetype
        }
      });

      // Write file buffer to GridFS
      uploadStream.write(file.buffer);
      uploadStream.end();

      // Wait for upload to complete
      await new Promise((resolve, reject) => {
        uploadStream.on('finish', () => {
          console.log('File uploaded successfully:', filename);
          resolve();
        });
        uploadStream.on('error', (error) => {
          console.error('Error uploading file:', error);
          reject(error);
        });
      });

      const imageUrl = `/api/images/${filename}`;

      // AI recognition (optional, if name/species not provided)
      let aiIdentified = false;
      let identifiedName = name;
      let identifiedSpecies = species;
      let confidence;

      if (!name || !species) {
        try {
          const recognition = await birdRecognition.identifyBird(file.buffer);
          if (recognition.identified) {
            identifiedName = recognition.predictions[0].label;
            identifiedSpecies = recognition.predictions[0].label; // Often species is same as main label for initial recognition
            aiIdentified = true;
            confidence = recognition.confidence;
          } else {
            // If AI cannot identify and no manual name/species, return error for this specific file
            return res.status(400).json({ 
              error: 'Please provide bird name and species, or upload a clearer image for AI identification.'
            });
          }
        } catch (recognitionError) {
          console.error('Error in bird recognition:', recognitionError);
          // Return error for this specific file if AI fails
          return res.status(400).json({
            error: 'AI recognition failed. Please provide bird name and species manually.'
          });
        }
      }

      const birdData = {
        name: identifiedName || '',
        description: description || '',
        region: region || '',
        species: identifiedSpecies || '',
        imageUrl,
        spottedAt: new Date(),
        aiIdentified,
        confidence,
        uploadedBy: req.user._id
      };

      const bird = new Bird(birdData);
      await bird.save();
      console.log('Bird saved successfully:', bird._id);
      uploadedBirds.push(bird);
    }

    res.status(201).json(uploadedBirds);

  } catch (error) {
    console.error('Error in upload endpoint:', error);
    res.status(500).json({ 
      error: 'Error uploading bird',
      details: error.message 
    });
  }
});

// Get all birds (filtered by user if authenticated)
app.get('/api/birds', auth, async (req, res) => {
  try {
    // Ensure req.user._id exists from auth middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const birds = await Bird.find({ uploadedBy: req.user._id }).sort({ createdAt: -1 });
    res.json(birds);
  } catch (error) {
    console.error('Error fetching birds:', error);
    res.status(500).json({ error: 'Error fetching birds' });
  }
});

// Get birds by region (filtered by user)
app.get('/api/birds/region/:region', auth, async (req, res) => {
  try {
    const birds = await Bird.find({ 
      region: req.params.region,
      uploadedBy: req.user._id 
    });
    res.json(birds);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching birds' });
  }
});

// Get birds by species (filtered by user)
app.get('/api/birds/species/:species', auth, async (req, res) => {
  try {
    const birds = await Bird.find({ 
      species: req.params.species,
      uploadedBy: req.user._id 
    });
    res.json(birds);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching birds' });
  }
});

// Search birds (filtered by user)
app.get('/api/birds/search', auth, async (req, res) => {
  try {
    const { query } = req.query;
    const birds = await Bird.find({
      uploadedBy: req.user._id,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    });
    res.json(birds);
  } catch (error) {
    res.status(500).json({ error: 'Error searching birds' });
  }
});

// Get bird species suggestions
app.get('/api/birds/suggestions', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.json([]);
    }
    const suggestions = findMatchingBirds(query);
    res.json(suggestions);
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({ error: 'Error getting suggestions' });
        }
});

// Get image by filename
app.get('/api/images/:filename', async (req, res) => {
  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });

    const files = await bucket.find({ filename: req.params.filename }).toArray();
    if (!files.length) {
      return res.status(404).json({ error: 'File not found' });
    }

    const downloadStream = bucket.openDownloadStreamByName(req.params.filename);
    downloadStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching image' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});