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
  const prompt = `OBJECTIVE: Extract maximum value from the CIM to create a content-rich 6-slide private equity intro deck. Focus on comprehensive information gathering, specific metrics, and detailed insights.
SLIDE 1: COMPANY SNAPSHOT
Extract ALL of the following from the CIM:
Company Overview:

Complete business description including all service lines, products, and offerings
Founding story, evolution, and key milestones with dates
Current scale and market position
Leadership team backgrounds and notable achievements
Company culture, values, and differentiators

Key Metrics (include every metric mentioned):

Revenue: Current year, prior years, growth rates
Customer metrics: Total customers, growth rate, concentration
Geographic footprint: Countries, states, cities served
Employee count: Total, by function, by location
Operational metrics: Transactions processed, units sold, utilization rates
Market share and ranking

Competitive Advantages:

Proprietary technology or processes
Patents, certifications, licenses
Strategic partnerships and exclusive relationships
Awards, recognitions, and third-party validations
Customer testimonials or case studies

Recent Momentum:

New product launches
Geographic expansion
Major customer wins
Strategic hires
Technology implementations

SLIDE 2: MARKET OPPORTUNITY
Comprehensive Market Analysis:
Market Sizing:

Total Addressable Market (TAM): Size, methodology, sources
Serviceable Addressable Market (SAM): Rationale for accessibility
Serviceable Obtainable Market (SOM): Realistic capture potential
Market segmentation: By product, geography, customer type
Growth rates: Historical (3-5 years) and projected (3-5 years)

Market Drivers (extract every driver mentioned):

Regulatory changes: Specific laws, compliance requirements, deadlines
Technology disruptions: AI, automation, digital transformation impacts
Demographic shifts: Population changes, generational preferences
Economic factors: GDP growth, industry spending, budget allocations
Social trends: Behavior changes, new needs emerging
Industry consolidation: M&A activity, player exits

Competitive Landscape:

Number of competitors by tier
Market fragmentation analysis
Barriers to entry: Capital requirements, regulations, network effects
Customer switching costs and loyalty factors
Pricing dynamics and trends

Timing Factors:

Why this market is attractive now
Inflection points or catalysts
Time-sensitive opportunities

SLIDE 3: COMPETITIVE POSITIONING
Detailed Competitive Analysis:
Market Position:

Market share: Exact percentage and ranking
Share gains/losses over time
Win rates against specific competitors
Customer retention vs. industry average

Head-to-Head Comparisons (specific metrics):

Pricing: Absolute prices and relative positioning
Features: Detailed capability comparison
Performance: Speed, accuracy, reliability metrics
Customer satisfaction: NPS, CSAT scores, reviews
Financial performance: Growth rates, margins, profitability

Customer Analysis:

Demographics: Industry, size, geography, decision-makers
Use cases: Primary, secondary, emerging
Acquisition: Channels, costs, conversion rates
Economics: LTV, CAC, payback period, churn
Satisfaction: Scores, testimonials, case studies
Concentration: Top 10, top 20 customer revenue %

Moat Analysis:

Network effects: User-to-user, data, social
Switching costs: Technical, contractual, behavioral
Scale advantages: Cost, distribution, brand
Proprietary assets: Technology, data, relationships

SLIDE 4: FINANCIAL PERFORMANCE
Extract ALL Financial Information:
Historical Performance (all available years):

Revenue: By year, quarter if available
Gross profit and margins
EBITDA and margins
Operating income and margins
Free cash flow
Working capital metrics

Growth Analysis:

Year-over-year growth by metric
CAGR for different time periods
Organic vs. inorganic growth
Volume vs. price contribution

Revenue Composition:

By product line: Revenue and growth by segment
By geography: Domestic vs. international split
By customer type: Enterprise vs. SMB vs. consumer
Recurring vs. transactional: Percentages and trends
Contract length and renewal rates

Unit Economics (detailed):

Customer acquisition cost by channel
Lifetime value by segment
Gross margin by product
Contribution margin analysis
Payback period trends
Cohort behavior patterns

Financial Quality Indicators:

Revenue recognition policies
Bad debt/collections
Seasonality patterns
One-time vs. recurring items
Capital requirements

SLIDE 5: INVESTMENT CONSIDERATIONS
Comprehensive Diligence Framework:
Market Validation Priorities:

TAM sizing methodology verification
Growth driver sustainability assessment
Competitive dynamics deep dive
Customer reference checks needed
Third-party market studies required

Financial Diligence Focus Areas:

Revenue quality analysis needs
Margin sustainability drivers
Working capital normalization
Growth algorithm breakdown
Unit economics verification
Customer cohort analysis
Churn and retention deep dive

Operational Assessment Requirements:

Technology platform evaluation
Scalability stress testing
Organization capability gaps
Process maturity assessment
Key person dependencies
Capacity constraint analysis

Strategic Questions to Answer:

Organic growth acceleration potential
M&A pipeline and integration capability
International expansion readiness
Product roadmap feasibility
Partnership expansion opportunities
Platform play potential

Risk Factors Requiring Investigation:

Regulatory changes on horizon
Technology disruption threats
Customer concentration issues
Competitive response scenarios
Execution risk factors
Market timing sensitivities

SLIDE 6: STRATEGIC SYNTHESIS
Investment Thesis Construction:
Core Value Proposition:

Primary investment rationale
Supporting evidence from CIM
Unique advantages vs. other opportunities
Value creation potential quantification

Value Creation Roadmap (detailed):

Revenue growth levers: New products, markets, channels
Margin expansion: Pricing, mix, efficiency
Operational improvements: Technology, process, organization
Strategic initiatives: M&A, partnerships, platforms
Timeline and sequencing
Resource requirements
Quick wins vs. long-term plays

Risk Mitigation Strategy:

Risk prioritization matrix
Mitigation strategies by risk
Monitoring mechanisms
Contingency planning

Exit Considerations:

Strategic buyer universe and rationale
Financial buyer interest factors
IPO readiness requirements
Optimal hold period analysis
Value maximization timeline

Success Factors:

Critical milestones years 1-3
Key hires needed
Board composition requirements
Partner/advisor needs

EXTRACTION INSTRUCTIONS:

Be Exhaustive: Include every relevant data point, metric, and insight from the CIM
Be Specific: Use exact numbers, not ranges or approximations
Be Contextual: Include explanations and rationale behind metrics
Be Comparative: Extract all benchmarks and relative performance data
Be Temporal: Show progression over time for all metrics where available
Be Strategic: Capture all growth options and value creation opportunities mentioned`;

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