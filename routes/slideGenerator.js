const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// API Key configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "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";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 32 * 1024 * 1024, // 32MB per file
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Store processing results temporarily (in production, use database)
const processingResults = new Map();

// Main slide instructions generation endpoint
router.post('/api/slide-generator/generate-instructions', upload.single('cim'), async (req, res) => {
  let uploadedFilePath = null;

  try {
    console.log('Received slide generation request');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CIM file uploaded'
      });
    }

    uploadedFilePath = req.file.path;
    console.log('Processing CIM file:', req.file.originalname);

    // Step 1: Read the CIM PDF
    const pdfBuffer = await fs.readFile(uploadedFilePath);
    console.log('PDF buffer size:', pdfBuffer.length);

    // Step 2: Generate slide outline using Claude
    console.log('Calling Claude API to analyze CIM and generate slide outline...');
    const slideInstructions = await generateSlideOutline(pdfBuffer, req.file.originalname);
    console.log('Slide instructions generated');

    // Clean up uploaded file
    await cleanupFile(uploadedFilePath);

    res.json({
      success: true,
      instructions: slideInstructions
    });

  } catch (error) {
    console.error('Slide generation error:', error);

    // Clean up on error
    if (uploadedFilePath) {
      await cleanupFile(uploadedFilePath);
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate slides'
    });
  }
});

// Generate slide outline using Claude API
async function generateSlideOutline(pdfBuffer, filename) {
  const prompt = `You are creating a prompt for Genspark to build a 5-6 slide introductory deck. Your job is to extract specific content from the provided CIM and format it into extremely detailed instructions that Genspark can follow exactly.
YOUR TASK: Generate a single Genspark prompt that includes:

Exact text/data extracted from the CIM
Precise pixel-by-pixel layout instructions
Specific color codes for every element
Word-for-word content with character limits

GENSPARK PROMPT TEMPLATE TO GENERATE:
CREATE PRIVATE EQUITY INTRO DECK FOR [COMPANY NAME]

MANDATORY SPECIFICATIONS:
- Canvas: Exactly 1920x1080px (16:9 ratio)
- NO white borders - backgrounds must extend to all edges
- NO overlapping elements - maintain 20px minimum spacing
- Use 12-column grid (each column = 160px width)

SLIDE 1: COMPANY OVERVIEW
Exact content from CIM:
- Title text: "Company Overview" 
- Company description: "[Extract 40-50 word description from CIM]"
- Founded: [Year] | Headquarters: [City, State]
- Business model: "[Extract exact 25-word description]"

Key metrics (extract exact values):
- Metric 1: "[Label]: [Value]" (e.g., "Revenue: $32.7M")
- Metric 2: "[Label]: [Value]" (e.g., "Customers: 23,000+")
- Metric 3: "[Label]: [Value]" (e.g., "Growth: 577% YoY")

Three value props (15-20 words each):
- [Extract specific differentiator 1]
- [Extract specific differentiator 2]  
- [Extract specific differentiator 3]

Layout instructions:
- Background: #F8F9FA full bleed to edges
- Header zone (0-200px height):
  - Title: 48pt Arial Bold, #1B3A5C, position at x:60px, y:80px
  - Company logo: 180x60px at x:1680px, y:60px
- Content zone (200-900px height):
  - Left column (columns 1-7): Text content
    - Description: 14pt Arial Regular, #2C3E50, x:60px, y:240px, max width:900px
    - Founded/HQ: 12pt Arial Regular, #7F8C8D, x:60px, y:320px
  - Right column (columns 8-12): Metric boxes
    - 3 boxes, each 280x100px, starting x:1040px, y:240px, 40px vertical spacing
    - Box background: #E8F4F8, border: 2px solid #D35400
    - Metric text: 16pt Arial Bold, #1B3A5C
  - Value props: x:60px, y:480px, width:900px, 14pt Arial Regular, #2C3E50
    - Bullet points: #D35400 circles, 8px diameter
    - Line height: 1.5x, paragraph spacing: 16px

SLIDE 2: MARKET OVERVIEW  
Exact content from CIM:
- Title text: "Market Overview"
- Market size: "The [market name] market is valued at $[X]B and growing at [Y]% CAGR through [year]"
- TAM: $[Value] | SAM: $[Value] | SOM: $[Value]

Growth drivers (4 bullets, each exactly 15-20 words):
- [Extract driver 1 with specific percentage/number]
- [Extract driver 2 with specific percentage/number]
- [Extract driver 3 with specific percentage/number]
- [Extract driver 4 with specific percentage/number]

Market data for chart:
- [Year 1]: $[Value]
- [Year 2]: $[Value]
- [Year 3]: $[Value]
- [Year 4]: $[Value]
- [Year 5]: $[Value]

Layout instructions:
- Background: #F8F9FA full bleed
- Header zone: Same as Slide 1
- Content split 50/50:
  - Left side (columns 1-6):
    - Market size statement: 16pt Arial Semi-Bold, #1B3A5C, x:60px, y:240px
    - TAM/SAM/SOM boxes: Three 240x80px boxes at y:320px, horizontal spacing 40px
      - Background: White, border: 1px solid #DDE1E5
    - Bullet points: x:60px, y:440px, width:700px
  - Right side (columns 7-12):
    - Chart area: x:980px, y:240px, width:880px, height:480px
    - Chart type: Line graph with area fill
    - Colors: Gradient from #1B3A5C (bottom) to #D35400 (top)
    - Grid lines: #E8E8E8, 1px width
    - Data labels: 11pt Arial Regular, #2C3E50

SLIDE 3: COMPETITIVE POSITIONING
Exact content from CIM:
- Title text: "Competitive Positioning"
- Market position: "[Company] is the [#X] largest player in [specific market segment]"
- Market share: [X]% | Next competitor: [Y]%

Customer profile (extract exact data):
- Primary segment: [Description, 20 words]
- Demographics: [Age range], [Gender split]%, [Geography]
- Average contract value: $[Amount]
- Retention rate: [X]%

Key differentiators (3 items, 20-25 words each):
1. [Extract specific competitive advantage]
2. [Extract specific competitive advantage]
3. [Extract specific competitive advantage]

Competitor comparison data:
- [Company]: [Metric 1], [Metric 2], [Metric 3]
- [Competitor 1]: [Metric 1], [Metric 2], [Metric 3]
- [Competitor 2]: [Metric 1], [Metric 2], [Metric 3]

Layout instructions:
- Three-section layout:
  - Top section (y:200-400px): Market position statement and share metrics
    - Position text: 18pt Arial Semi-Bold, #1B3A5C, centered
    - Share boxes: Two 300x120px boxes, centered horizontally
  - Middle section (y:400-600px): Customer profile in 4-column grid
    - Each item in 400x150px box, white background
  - Bottom section (y:600-900px): Comparison table
    - Full width table, x:60px to x:1860px
    - Header row: #1B3A5C background, white text, 14pt Bold
    - Data rows: Alternating #FAFAFA and white
    - Cell padding: 12px all sides

SLIDE 4: FINANCIAL SNAPSHOT
Exact content from CIM:
- Title text: "Financial Snapshot"  
- Revenue: [Year 1]: $[Amount] → [Year 2]: $[Amount] ([Growth]%)
- EBITDA: $[Amount] ([Margin]%)
- Gross Margin: [X]% | Operating Margin: [Y]%

Key metrics grid (extract exact values):
- LTV: $[Amount]
- CAC: $[Amount]  
- LTV/CAC: [Ratio]x
- Payback: [X] months
- MRR: $[Amount]
- Churn: [X]%

Revenue breakdown:
- [Product/Segment 1]: [X]% ($[Amount])
- [Product/Segment 2]: [Y]% ($[Amount])
- [Product/Segment 3]: [Z]% ($[Amount])

Historical financials for chart:
- [Year-2]: Revenue $[Amount], EBITDA $[Amount]
- [Year-1]: Revenue $[Amount], EBITDA $[Amount]
- [Current]: Revenue $[Amount], EBITDA $[Amount]

Layout instructions:
- Four-quadrant layout:
  - Top left (x:60-920px, y:200-500px): Revenue growth visualization
    - Bar chart with growth line overlay
  - Top right (x:1000-1860px, y:200-500px): Margin analysis
    - Two semi-circular gauges for gross/operating margins
  - Bottom left (x:60-920px, y:540-840px): Unit economics grid
    - 6 metric boxes in 3x2 grid, each 260x120px
  - Bottom right (x:1000-1860px, y:540-840px): Revenue breakdown
    - Donut chart with percentages

SLIDE 5: KEY DILIGENCE AREAS
Exact content from CIM gaps:
- Title text: "Key Diligence Areas"

Priority research areas (based on CIM analysis):
1. Market Validation
   • [Specific question about market size/growth claims]
   • [Specific question about competitive dynamics]
   • [Specific data point that needs verification]

2. Financial Deep Dive
   • [Question about revenue recognition/quality]
   • [Question about unit economics sustainability]
   • [Question about cash flow/working capital]

3. Operational Assessment  
   • [Question about scalability/capacity]
   • [Question about technology/platform risk]
   • [Question about key dependencies]

4. Customer Analysis
   • [Question about concentration/churn]
   • [Question about satisfaction/NPS]
   • [Question about acquisition channels]

Timeline: [X] weeks estimated

Layout instructions:
- Four equal boxes in 2x2 grid:
  - Each box: 860x340px with 40px spacing
  - Header: 20pt Arial Bold, #D35400
  - Background: White with 1px #DDE1E5 border
  - Bullets: 12pt Arial Regular, #2C3E50
  - Sub-bullets: 11pt, indent 40px
- Timeline bar at bottom: Full width, 60px height, #1B3A5C background

SLIDE 6: TRANSACTION CONSIDERATIONS
Exact content from CIM:
- Title text: "Transaction Considerations"

Key investment highlights (3 points, 25-30 words each):
- [Extract main value driver from CIM]
- [Extract growth opportunity from CIM]
- [Extract competitive moat from CIM]

Primary risks identified:
- [Risk 1 from CIM]: [Impact level]
- [Risk 2 from CIM]: [Impact level]  
- [Risk 3 from CIM]: [Impact level]

Initial valuation considerations:
- Revenue multiple range: [X]x - [Y]x
- EBITDA multiple range: [X]x - [Y]x
- Comparable transactions: [List 2-3 if mentioned]

Next steps:
1. [Immediate action item]
2. [Immediate action item]
3. [Immediate action item]

Layout instructions:
- Two-column layout (60/40 split):
  - Left column: Highlights and risks
    - Highlights: Green accent (#27AE60) for bullet points
    - Risks: Orange accent (#F39C12) for bullet points
  - Right column: Valuation and next steps
    - Valuation box: #E8F4F8 background
    - Next steps: Numbered list with #1B3A5C numbers

GLOBAL RULES FOR ALL SLIDES:
- Page numbers: Bottom right, "X of 6" format, 10pt Arial Regular, #7F8C8D
- Confidentiality notice: Bottom center, 8pt Arial Regular, #7F8C8D
- All numerical data must be exactly as shown in CIM
- Maximum 250 words per slide
- Minimum 35% whitespace per slide
- No overlapping elements - verify all spacing
EXTRACTION INSTRUCTIONS:
When analyzing the CIM, you must:

Pull exact numbers, percentages, and dates
Quote company descriptions verbatim when under 50 words
Extract specific competitive advantages, not generic statements
Identify actual data gaps for diligence section
Use precise terminology from the CIM
Never approximate or round numbers
Include currency symbols and units exactly as shown

OUTPUT REQUIREMENTS:

Generate one continuous prompt without placeholders
Every element must have exact pixel coordinates
All colors must use hex codes provided
Each content piece must have character/word limits
Spacing must be explicitly defined
No subjective language or recommendations`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-opus-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [{
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBuffer.toString('base64')
            }
          },
          {
            type: 'text',
            text: prompt
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    if (!response.data.content || !response.data.content[0]) {
      throw new Error('Invalid response from Claude API');
    }

    const slideOutline = response.data.content[0].text;
    console.log('Claude response preview:', slideOutline.substring(0, 500));

    return slideOutline;

  } catch (error) {
    if (error.response) {
      console.error('Claude API error:', error.response.status, error.response.data);
      throw new Error(`Claude API error: ${error.response.data.error?.message || error.response.statusText}`);
    }
    throw error;
  }
}

// Note: SlideSpeak integration has been removed. 
// The instructions generated by Claude AI should be manually fed into your preferred slide generator.

// Cleanup uploaded files
async function cleanupFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log('Cleaned up file:', filePath);
  } catch (error) {
    console.error(`Failed to delete ${filePath}:`, error);
  }
}

// Health check endpoint
router.get('/api/slide-generator/health', (req, res) => {
  res.json({
    success: true,
    service: 'Slide Instructions Generator',
    timestamp: new Date().toISOString(),
    note: 'API key is now provided by the user'
  });
});

module.exports = router;