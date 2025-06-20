const express = require('express');
const router = express.Router();

// Simple password authentication
const VALID_PASSWORD = 'Presidio123';

router.post('/login', (req, res) => {
  const { password } = req.body;

  if (password === VALID_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

module.exports = router;