const express = require("express");
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
app.use('/api', primerRoutes);
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Presidio Intelligence Platform running on port ${PORT}`);
});