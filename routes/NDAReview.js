const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const axios = require('axios');
const pdfParse = require('pdf-parse');

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

// Main NDA review endpoint
router.post('/api/review_nda', upload.single('nda'), async (req, res) => {
  let uploadedFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    uploadedFilePath = req.file.path;
    const pdfBuffer = await fs.readFile(uploadedFilePath);

    // Analyze NDA with Claude
    const analysis = await analyzeNDAWithClaude(pdfBuffer);

    // Clean up uploaded file
    await fs.unlink(uploadedFilePath).catch(() => {});

    // Return structured response
    res.json({
      success: true,
      analysis: analysis
    });

  } catch (error) {
    console.error('NDA review error:', error);

    // Clean up uploaded file on error
    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze NDA'
    });
  }
});

// Analyze NDA with Claude
async function analyzeNDAWithClaude(pdfBuffer) {
  // Parse PDF to extract text
  console.log('Parsing PDF for text extraction...');
  const pdfData = await pdfParse(pdfBuffer);
  const pdfText = pdfData.text;
  console.log(`Extracted ${pdfText.length} characters from PDF`);
  
  if (!pdfText || pdfText.length < 100) {
    throw new Error('PDF text extraction failed or document is too short');
  }
  
  // Truncate text if it's too long
  const maxTextLength = 150000;
  const documentText = pdfText.length > maxTextLength 
    ? pdfText.substring(0, maxTextLength) + '\n\n[Document truncated due to length...]'
    : pdfText;
  
  const prompt = `You are a legal expert analyzing an NDA. Highlight any industry non-standard clauses or provisions.

Analyze each clause and categorize them into:
1. Confidentiality Definition
2. Scope of Restrictions  
3. Duration/Term
4. Permitted Disclosures
5. Return/Destruction
6. Remedies/Enforcement
7. Governing Law/Jurisdiction
8. Non-Compete/Non-Solicitation (if present)
9. Intellectual Property Rights
10. Indemnification

For each clause, determine:
- Extract the exact text from the document
- Market standard compliance (compare to typical market terms)
- Risk level (low/medium/high)
- Specific issues or concerns
- Recommended actions
- Confidence score (0-1)

Identify document type: mutual, unilateral, or multilateral NDA.

Compare all terms against market standards and flag any unusual provisions. Specifically, call attention to any clauses that deviate from common industry practices.

Return JSON with this EXACT structure:
{
  "documentType": "mutual/unilateral/multilateral",
  "overallRisk": "low/medium/high",
  "clauses": [
    {
      "id": "clause_1",
      "type": "confidentiality_definition",
      "text": "exact clause text from document",
      "status": "standard/concerning/problematic",
      "marketComparison": "above/at/below market standard",
      "issues": ["specific issue 1", "specific issue 2"],
      "recommendation": "specific action needed",
      "severity": "low/medium/high",
      "pageNumber": 1,
      "confidence": 0.85
    }
  ],
  "redFlags": [
    {
      "clauseId": "clause_id",
      "issue": "description of critical issue",
      "impact": "business impact explanation",
      "urgency": "immediate/review/monitor"
    }
  ],
  "marketDeviations": [
    {
      "clauseId": "clause_id",
      "standard": "typical market terms",
      "actual": "what document contains",
      "recommendation": "suggested modification"
    }
  ],
  "summary": {
    "totalClauses": 10,
    "problematicClauses": 3,
    "marketDeviations": 2,
    "keyRisks": ["risk 1", "risk 2"],
    "recommendedActions": ["action 1", "action 2"]
  }
}`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `${prompt}\n\nDocument content:\n${documentText}`
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

    // Parse JSON response
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);

        // Validate the structure
        if (!analysis.documentType || !analysis.clauses || !Array.isArray(analysis.clauses)) {
          throw new Error('Invalid analysis structure');
        }

        // Post-process the analysis
        return postProcessAnalysis(analysis);
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', responseText);
      throw new Error('Failed to parse AI analysis');
    }

    throw new Error('No valid JSON found in response');

  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error('Failed to analyze NDA: ' + error.message);
  }
}

// Post-process and enhance the analysis
function postProcessAnalysis(analysis) {
  // Add severity scoring
  analysis.severityScore = calculateSeverityScore(analysis);

  // Sort clauses by severity
  analysis.clauses.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });

  // Add quick stats
  analysis.stats = {
    totalClauses: analysis.clauses.length,
    highRisk: analysis.clauses.filter(c => c.severity === 'high').length,
    mediumRisk: analysis.clauses.filter(c => c.severity === 'medium').length,
    lowRisk: analysis.clauses.filter(c => c.severity === 'low').length,
    redFlagCount: analysis.redFlags ? analysis.redFlags.length : 0,
    deviationCount: analysis.marketDeviations ? analysis.marketDeviations.length : 0
  };

  return analysis;
}

// Calculate overall severity score
function calculateSeverityScore(analysis) {
  let score = 0;
  const weights = { high: 3, medium: 2, low: 1 };

  analysis.clauses.forEach(clause => {
    score += weights[clause.severity] || 0;
  });

  // Add weight for red flags
  if (analysis.redFlags) {
    score += analysis.redFlags.length * 5;
  }

  // Normalize to 0-100
  const maxScore = (analysis.clauses.length * 3) + (analysis.redFlags?.length || 0) * 5;
  return Math.round((score / maxScore) * 100);
}

module.exports = router;