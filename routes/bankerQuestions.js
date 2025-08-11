const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const fsSync = require('fs');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const path = require('path');

// API Key configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "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";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 32 * 1024 * 1024 // 32MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Ensure outputs directory exists
async function ensureOutputsDir() {
  try {
    await fs.access('outputs');
  } catch {
    await fs.mkdir('outputs', { recursive: true });
  }
}

// Endpoint 1: Generate Detailed Questions
router.post('/api/generate_banker_questions_pdf', upload.single('pdf'), async (req, res) => {
  let uploadedFilePath = null;

  try {
    // Get content either from PDF or direct text input
    let content;
    if (req.file) {
      uploadedFilePath = req.file.path;
      const pdfBuffer = await fs.readFile(uploadedFilePath);
      content = {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfBuffer.toString('base64')
        }
      };
    } else if (req.body.cimData) {
      content = {
        type: 'text',
        text: req.body.cimData
      };
    } else {
      return res.status(400).json({
        success: false,
        error: 'No PDF file or text content provided'
      });
    }

    // Generate questions using Claude
    const analysis = await generateDetailedQuestions(content);

    // Clean up uploaded file if exists
    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(() => {});
    }

    // Return response
    res.json({
      success: true,
      analysis: analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating detailed questions:', error);

    // Clean up uploaded file on error
    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate questions'
    });
  }
});

// Endpoint 2: Generate Basic Data Questions
router.post('/api/generate_basic_data_questions', upload.single('pdf'), async (req, res) => {
  let uploadedFilePath = null;

  try {
    // Get content either from PDF or direct text input
    let content;
    if (req.file) {
      uploadedFilePath = req.file.path;
      const pdfBuffer = await fs.readFile(uploadedFilePath);
      content = {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfBuffer.toString('base64')
        }
      };
    } else if (req.body.cimData) {
      content = {
        type: 'text',
        text: req.body.cimData
      };
    } else {
      return res.status(400).json({
        success: false,
        error: 'No PDF file or text content provided'
      });
    }

    // Generate questions using Claude
    const analysis = await generateBasicDataQuestions(content);

    // Clean up uploaded file if exists
    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(() => {});
    }

    // Return response
    res.json({
      success: true,
      analysis: analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating basic data questions:', error);

    // Clean up uploaded file on error
    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate questions'
    });
  }
});

// PDF Download endpoint
router.get('/api/download_questions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const filePath = path.join('outputs', `banker_questions_${sessionId}.pdf`);

    // Check if file exists
    await fs.access(filePath);

    res.download(filePath, `banker_questions_${sessionId}.pdf`);
  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// Generate detailed due diligence questions
async function generateDetailedQuestions(content) {
  const prompt = `You are an expert investment banker conducting due diligence on a potential acquisition target. Analyze the provided CIM and generate comprehensive due diligence questions organized by category.

Return your response as JSON with this EXACT structure:
{
  "companyName": "extracted company name",
  "industry": "company industry",
  "analysisType": "Detailed Due Diligence Questions",
  "totalQuestions": 25,
  "categories": [
    {
      "name": "Financial Performance & Projections",
      "priority": "high",
      "questionCount": 6,
      "questions": [
        {
          "id": "fin_1",
          "question": "What are the key drivers behind the projected revenue growth?",
          "priority": "high",
          "rationale": "Understanding growth assumptions is critical for valuation"
        }
      ]
    },
    {
      "name": "Business Model & Operations", 
      "priority": "high",
      "questionCount": 5,
      "questions": []
    },
    {
      "name": "Market & Competition",
      "priority": "medium", 
      "questionCount": 4,
      "questions": []
    },
    {
      "name": "Management & Organization",
      "priority": "medium",
      "questionCount": 3,
      "questions": []
    },
    {
      "name": "Technology & IP",
      "priority": "medium",
      "questionCount": 3,
      "questions": []
    },
    {
      "name": "Legal & Regulatory",
      "priority": "low",
      "questionCount": 2,
      "questions": []
    },
    {
      "name": "Risk Factors",
      "priority": "high",
      "questionCount": 2,
      "questions": []
    }
  ],
  "keyInsights": [
    "Notable strength or concern 1",
    "Notable strength or concern 2"
  ],
  "recommendedFocus": [
    "Area requiring special attention 1",
    "Area requiring special attention 2"
  ]
}

Generate insightful, specific questions that would help assess the investment opportunity. Each question should be actionable and help uncover potential value drivers or risks.`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            content,
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 180000 // 3 minutes timeout
      }
    );

    if (!response.data.content || !response.data.content[0]) {
      throw new Error('Invalid response from Claude API');
    }

    const responseText = response.data.content[0].text;

    // Try to parse JSON response
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);

        // Generate PDF and return enhanced analysis
        const sessionId = Date.now();
        await generateQuestionsPDF(analysis, sessionId);
        analysis.sessionId = sessionId;

        return analysis;
      }
    } catch (e) {
      console.error('Failed to parse response:', e);
    }

    throw new Error('Could not parse questions from response');

  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error('Failed to generate questions from AI');
  }
}

// Generate basic data request questions
async function generateBasicDataQuestions(content) {
  const prompt = `You are preparing a comprehensive data request list for due diligence. Analyze the provided CIM and generate specific data requests organized by category.

Return your response as JSON with this EXACT structure:
{
  "companyName": "extracted company name",
  "industry": "company industry", 
  "analysisType": "Data Request List",
  "totalRequests": 35,
  "categories": [
    {
      "name": "Financial Data",
      "priority": "high",
      "note": "All financial data should be provided in Excel format where applicable",
      "requestCount": 8,
      "requests": [
        {
          "id": "fin_data_1",
          "request": "Monthly P&L statements 2020-2024 directly from accounting system",
          "priority": "high",
          "format": "Excel",
          "timeframe": "2020-2024"
        }
      ]
    },
    {
      "name": "Operations",
      "priority": "high", 
      "requestCount": 6,
      "requests": []
    },
    {
      "name": "Sales & Marketing",
      "priority": "medium",
      "requestCount": 5,
      "requests": []
    },
    {
      "name": "Legal & Compliance", 
      "priority": "medium",
      "requestCount": 4,
      "requests": []
    },
    {
      "name": "Technology & Systems",
      "priority": "medium", 
      "requestCount": 4,
      "requests": []
    },
    {
      "name": "Human Resources",
      "priority": "low",
      "requestCount": 3,
      "requests": []
    },
    {
      "name": "Market & Customer Data",
      "priority": "medium",
      "requestCount": 3,
      "requests": []
    },
    {
      "name": "Assets & Property",
      "priority": "low",
      "requestCount": 2,
      "requests": []
    }
  ],
  "criticalDocuments": [
    "Document type that requires immediate attention",
    "Another critical document type"
  ],
  "timeline": "Standard 2-week data room population timeline recommended"
}

Focus on specific documents, data exports, and reports. Avoid analytical questions - only request concrete deliverables.`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            content,
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 180000 // 3 minutes timeout
      }
    );

    if (!response.data.content || !response.data.content[0]) {
      throw new Error('Invalid response from Claude API');
    }

    const responseText = response.data.content[0].text;

    // Try to parse JSON response
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);

        // Generate PDF and return enhanced analysis
        const sessionId = Date.now();
        await generateDataRequestPDF(analysis, sessionId);
        analysis.sessionId = sessionId;

        return analysis;
      }
    } catch (e) {
      console.error('Failed to parse response:', e);
    }

    throw new Error('Could not parse data requests from response');

  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error('Failed to generate data requests from AI');
  }
}

// Generate PDF for detailed questions
async function generateQuestionsPDF(analysis, sessionId) {
  await ensureOutputsDir();

  const doc = new PDFDocument({ margin: 50 });
  const filePath = path.join('outputs', `banker_questions_${sessionId}.pdf`);

  doc.pipe(fsSync.createWriteStream(filePath));

  // Simple header
  doc.fontSize(18).text('Due Diligence Questions', { align: 'center' });
  doc.moveDown(2);

  // Create one continuous numbered list of all questions
  let questionNumber = 1;

  analysis.categories.forEach((category) => {
    category.questions.forEach((q) => {
      doc.fontSize(12).text(`${questionNumber}. ${q.question}`);
      doc.moveDown(0.3);
      questionNumber++;
    });
  });

  doc.end();
}

// Generate PDF for data requests
async function generateDataRequestPDF(analysis, sessionId) {
  await ensureOutputsDir();

  const doc = new PDFDocument({ margin: 50 });
  const filePath = path.join('outputs', `banker_questions_${sessionId}.pdf`);

  doc.pipe(fsSync.createWriteStream(filePath));

  // Simple header
  doc.fontSize(18).text('Data Request List', { align: 'center' });
  doc.moveDown(2);

  // Create one continuous numbered list of all requests
  let requestNumber = 1;

  analysis.categories.forEach((category) => {
    category.requests.forEach((req) => {
      doc.fontSize(12).text(`${requestNumber}. ${req.request}`);
      doc.moveDown(0.3);
      requestNumber++;
    });
  });

  doc.end();
}

module.exports = router;