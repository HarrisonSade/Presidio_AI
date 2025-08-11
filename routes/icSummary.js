const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');

// Ensure uploads directory exists
async function ensureUploadsDir() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 32 * 1024 * 1024 // 32MB limit (Claude's max request size)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Generate IC Summary endpoint
router.post('/generate', upload.single('pdf'), async (req, res) => {
  // Ensure uploads directory exists
  await ensureUploadsDir();

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Read the PDF file as buffer
    const pdfBuffer = await fs.readFile(req.file.path);

    // Convert to base64 for Claude API
    const pdfBase64 = pdfBuffer.toString('base64');

    // Delete the uploaded file after reading
    await fs.unlink(req.file.path);

    // API Key
    const apiKey = process.env.ANTHROPIC_API_KEY || "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";

    // Create prompt that will accompany the PDF
    const prompt = `You are a PE analyst creating a factual summary of an investment opportunity from a CIM. Provide objective information only - no opinions, recommendations, or subjective assessments.

IMPORTANT: Output in clean, readable format. Use plain text with clear sections.

Provide your analysis in this exact format:

──────────────────────────────────────────────────────────────────
COMPANY OVERVIEW
Business Description
[3-4 sentences: What they do, core products/services, business model, scale of operations]

Transaction Background  
[Banker, seller identity, stated motivations for sale, process timeline, any relevant history]

Financial Profile
- Revenue (LTM): $XXm
- Gross Profit: $XXm (XX%)  
- Adj. EBITDA: $XXm (XX%)
- Key operating metrics: [e.g., recurring revenue %, customer count, units sold]

Process Status
[Current process stage, IOI deadline if applicable, stated valuation expectations if disclosed]

──────────────────────────────────────────────────────────────────
INDUSTRY OVERVIEW
Market Dynamics
- Market size: [if disclosed]
- Growth rate: [historical/projected if available]
- Key trends: [factual industry developments]
- Regulatory environment: [relevant regulations or changes]

Competitive Landscape
- Market position: [stated market share or ranking]
- Key competitors: [named competitors from CIM]
- Differentiation factors: [claimed competitive advantages as stated]

──────────────────────────────────────────────────────────────────
OPERATIONAL PROFILE
Customer Base
- Customer concentration: [top customer %s]
- Customer types/segments: [as described]
- Geographic distribution: [markets served]
- Contract terms: [length, recurring nature if applicable]

Supplier/Vendor Profile
- Key suppliers: [if material suppliers disclosed]
- Supply chain characteristics: [geographic, concentration]
- Input cost factors: [major cost drivers]

Management Team
- Leadership tenure and background: [factual career summaries]
- Organizational structure: [team size, key roles]

──────────────────────────────────────────────────────────────────
FINANCIAL ANALYSIS
Historical Performance
- Revenue trend: [3-5 year growth pattern]
- Profitability trend: [margin evolution]
- Cash flow characteristics: [working capital, capex patterns]
- Debt profile: [current leverage, terms]

Financial Characteristics
- Revenue drivers: [volume vs. price, seasonality]
- Cost structure: [fixed vs. variable breakdown]
- Capital requirements: [maintenance capex, growth capex needs]

──────────────────────────────────────────────────────────────────
DILIGENCE PRIORITIES
Critical Validation Areas
1. [Area requiring verification with specific data points to confirm]
2. [Second priority area with key items to validate]
3. [Third priority area with essential confirmations needed]

Operational Due Diligence Focus
- [Operational area requiring detailed review]
- [Process or system requiring validation]
- [Key performance metric requiring confirmation]

Financial Due Diligence Focus
- [Financial area requiring detailed analysis]
- [Accounting policy or treatment to review]
- [Cash flow item requiring validation]

Commercial Due Diligence Focus
- [Market assumption to validate]
- [Customer relationship to confirm]
- [Competitive position to verify]

Risk Areas Requiring Assessment
- [Identified risk factor requiring evaluation]
- [Regulatory or compliance area to review]
- [Operational dependency to assess]
──────────────────────────────────────────────────────────────────

Use web search to gather factual information on:
- Recent company news and developments
- Industry growth rates and market data
- Recent comparable transactions
- Management team backgrounds
- Competitive landscape updates

Focus on factual summarization only. Do not provide investment opinions, recommendations, or subjective assessments.`;

    // Call Claude API with PDF document
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      timeout: 180000, // 3 minutes timeout
      body: JSON.stringify({
        model: "claude-3-opus-20240229",  // Claude 3 Opus for comprehensive analysis
        max_tokens: 2500,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5  // Reduced searches for speed
        }],
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      res.status(400).json({ error: data.error.message });
    } else {
      // Extract text content with citations
      let summary = "";

      // Loop through all content blocks
      for (const content of data.content) {
        if (content.type === "text") {
          // Add text content
          summary += content.text;

          // Add citations if they exist
          if (content.citations && content.citations.length > 0) {
            summary += "\n\n**Sources:**\n";
            content.citations.forEach((citation, index) => {
              summary += `${index + 1}. ${citation.title}\n`;
            });
          }
        }
      }

      // Send plain text summary without any formatting
      res.json({ summary });
    }

  } catch (error) {
    // Clean up file if it exists
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    console.error('Error processing PDF:', error);
    let errorMessage = "Failed to process PDF";
    if (error.name === 'TimeoutError') {
      errorMessage = "Request timed out. Please try again with a smaller file.";
    } else if (error.response) {
      errorMessage = `API Error: ${error.response.status} - ${error.response.statusText}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ error: errorMessage });
  }
});

module.exports = router;