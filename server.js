const express = require("express");
const path = require('path');
const app = express();

// Middleware
app.use(express.json({ limit: '50mb' })); // Increase JSON payload limit
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Support form data
app.use(express.static(path.join(__dirname, 'public')));

// CORS configuration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Import routes
const authRoutes = require('./routes/auth');
const primerRoutes = require('./routes/primer');
const icSummaryRoutes = require('./routes/icSummary');
const podcastRoutes = require('./routes/podcast');
const bankerQuestionsRoutes= require('./routes/bankerQuestions');
const NDAReviewRoutes = require('./routes/NDAReview');
const contractWaterfallRoutes = require('./routes/contractWaterfall');
const slideGeneratorRoutes = require('./routes/slideGenerator');


// Use routes
app.use('/api/auth', authRoutes);
app.use('/', primerRoutes);
app.use('/api/ic-summary', icSummaryRoutes);
app.use('/api/podcast', podcastRoutes);
app.use('/', bankerQuestionsRoutes);
app.use('/', NDAReviewRoutes);
app.use('/', contractWaterfallRoutes);
app.use('/', slideGeneratorRoutes);


// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/primer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'primer.html'));
});

app.get('/ic-summary', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ic-summary.html'));
});

app.get('/podcast', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'podcast.html'));
});

app.get('/bankerQuestions', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bankerQuestions.html'));
});

app.get('/NDAReview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'NDAReview.html'));
});

app.get('/contractWaterfall', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ContractWaterfall.html'));
});

app.get('/slideGenerator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'slideGenerator.html'));
});

// Add 404 handler for debugging
app.use((req, res, next) => {
  console.log(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method 
  });
});

// Add error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Presidio Intelligence Platform running on port ${PORT}`);
  console.log('Routes registered:');
  console.log('- /api/podcast/generate');
  console.log('- /api/podcast/download/:filename');
});