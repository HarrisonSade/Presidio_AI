const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');

// API Key configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "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";

// Configure multer for multiple file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 32 * 1024 * 1024, // 32MB per file
    files: 20 // Maximum 20 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Store analysis results temporarily (in production, use database)
const analysisResults = new Map();

// Main analysis endpoint
router.post('/api/contract-waterfall/analyze', upload.array('contracts', 20), async (req, res) => {
  const uploadedFiles = [];

  try {
    console.log('Received request with files:', req.files?.length);
    console.log('Metrics:', req.body.metrics);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    if (!req.body.metrics) {
      return res.status(400).json({
        success: false,
        error: 'No metrics defined'
      });
    }

    // Store uploaded file paths for cleanup
    uploadedFiles.push(...req.files.map(f => f.path));

    console.log(`Processing ${req.files.length} contracts...`);

    // Parse metrics from the request
    const metricsDefinition = req.body.metrics;
    const metrics = parseMetrics(metricsDefinition);
    console.log('Parsed metrics:', metrics);

    // Process each contract
    const contractResults = [];

    // Process contracts sequentially to avoid rate limiting
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      console.log(`Processing contract ${i + 1}/${req.files.length}: ${file.originalname}`);

      try {
        const pdfBuffer = await fs.readFile(file.path);
        console.log(`Read PDF buffer, size: ${pdfBuffer.length} bytes`);

        const extractedData = await extractMetricsFromContract(
          pdfBuffer, 
          file.originalname, 
          metrics,
          metricsDefinition
        );

        contractResults.push({
          filename: file.originalname,
          data: extractedData  // Store raw data
        });

        // Add a small delay between API calls to avoid rate limiting
        if (i < req.files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`Error processing ${file.originalname}:`, error);
        contractResults.push({
          filename: file.originalname,
          data: {},  // Empty data on error
          error: error.message
        });
      }
    }

    console.log('All contracts processed, generating Excel...');

    // Generate Excel file
    const analysisId = uuidv4();
    const excelPath = await generateExcelFile(contractResults, metrics, analysisId);

    // Store result for download
    analysisResults.set(analysisId, {
      path: excelPath,
      created: new Date(),
      contracts: contractResults.length
    });

    // Clean up uploaded files
    await cleanupFiles(uploadedFiles);

    // Schedule cleanup of Excel file after 1 hour
    setTimeout(() => {
      cleanupAnalysis(analysisId);
    }, 60 * 60 * 1000);

    console.log('Analysis complete, sending response');

    res.json({
      success: true,
      analysisId: analysisId,
      contractsProcessed: contractResults.length,
      downloadUrl: `/api/contract-waterfall/download/${analysisId}`
    });

  } catch (error) {
    console.error('Analysis error:', error);

    // Clean up on error
    await cleanupFiles(uploadedFiles);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze contracts'
    });
  }
});

// Download endpoint
router.get('/api/contract-waterfall/download/:analysisId', async (req, res) => {
  try {
    const analysisId = req.params.analysisId;
    const result = analysisResults.get(analysisId);

    console.log('Download requested for:', analysisId);
    console.log('Result found:', !!result);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found or expired'
      });
    }

    // Check if file still exists
    await fs.access(result.path);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="contract_waterfall_${analysisId}.xlsx"`);

    const fileStream = require('fs').createReadStream(result.path);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({
      success: false,
      error: 'File not found'
    });
  }
});

// Parse metrics from user input - FIXED VERSION
function parseMetrics(metricsText) {
  const lines = metricsText.split('\n').filter(line => line.trim());
  const metrics = [];

  lines.forEach(line => {
    // Remove leading hyphens or bullets
    line = line.replace(/^[-•*]\s*/, '').trim();

    const colonIndex = line.indexOf(':');
    let name, type = 'text';

    if (colonIndex > -1) {
      name = line.substring(0, colonIndex).trim();
      const typeInfo = line.substring(colonIndex + 1).trim().toLowerCase();

      if (typeInfo.includes('number') || typeInfo.includes('amount') || typeInfo.includes('$')) {
        type = 'number';
      } else if (typeInfo.includes('date')) {
        type = 'date';
      } else if (typeInfo.includes('percent') || typeInfo.includes('%')) {
        type = 'percentage';
      }
    } else {
      name = line.replace(/\([^)]*\)/g, '').trim();
    }

    if (name) {
      metrics.push({
        name: name,
        type: type,
        key: name.toLowerCase().replace(/[^a-z0-9]/g, '_')
      });
    }
  });

  return metrics;
}

// Extract metrics from a single contract using Claude - UPDATED PROMPT
async function extractMetricsFromContract(pdfBuffer, filename, metrics, metricsDefinition) {
  // Clean up the metrics definition for the prompt
  const cleanedMetrics = metricsDefinition
    .split('\n')
    .map(line => line.replace(/^[-•*]\s*/, '').trim())
    .filter(line => line)
    .join('\n');

  const prompt = `You are analyzing a contract to extract specific metrics. 

The user wants to extract the following metrics from each contract:
${cleanedMetrics}

Please extract these exact metrics from the contract. For each metric:
- If found, provide the exact value
- If not found, return "Not found" or "N/A"
- For numbers, extract numeric values only (no currency symbols or commas)
- For dates, use MM/DD/YYYY format
- For percentages, return as decimal (e.g., 0.15 for 15%)

Additionally, extract the amendment history if present. The amendment history should capture all rate changes, date modifications, and status updates throughout the contract lifecycle.

IMPORTANT: For the Amendment_History field, format it as a readable multi-line string with each amendment on a separate line, using the format: "Date Range | Rate | Status"

Return your response as a JSON object with keys matching the metric names EXACTLY as provided above (without any leading hyphens or bullets), plus an "Amendment_History" field containing a formatted string.

Example response format:
{
  "Company Name": "Acme Corp",
  "Transaction Value": 5000000,
  "Closing Date": "12/31/2023",
  "Revenue Multiple": 2.5,
  "EBITDA": 1000000,
  "Amendment_History": "4/1/2025 - 8/29/2025 | $95.83 Hourly | Active\n3/1/2025 - 3/31/2025 | $95.83 Hourly | Expired\n9/1/2024 - 2/28/2025 | $95.83 Hourly | Expired\n6/6/2024 - 8/31/2024 | $95.83 Hourly | Expired"
}

Format each amendment line as: "Date Range | $Rate Rate_Type | Status"
Use \n (newline) characters to separate each amendment.
If no amendment history is found, set "Amendment_History" to "No amendment history found".`;

  try {
    console.log('Calling Claude API for:', filename);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 2000,
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
        },
        timeout: 180000 // 3 minutes timeout
      }
    );

    console.log('Claude API response received');

    if (!response.data.content || !response.data.content[0]) {
      throw new Error('Invalid response from Claude API');
    }

    const responseText = response.data.content[0].text;
    console.log('Claude response preview:', responseText.substring(0, 200));

    // Parse JSON response
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extractedData = JSON.parse(jsonMatch[0]);
        console.log('Extracted data:', extractedData);

        // Return the extracted data directly
        return extractedData;
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError);
      throw new Error('Failed to parse extracted data');
    }

    throw new Error('No valid data extracted');

  } catch (error) {
    if (error.response) {
      console.error('Claude API error:', error.response.status, error.response.data);
      throw new Error(`Claude API error: ${error.response.data.error?.message || error.response.statusText}`);
    }
    throw error;
  }
}

// Normalize extracted values based on type
function normalizeValue(value, type) {
  if (value === undefined || value === null || value === 'Not found' || value === 'N/A') {
    return '';
  }

  switch (type) {
    case 'number':
      const numStr = value.toString().replace(/[$,]/g, '');
      const num = parseFloat(numStr);
      return isNaN(num) ? '' : num;

    case 'percentage':
      if (typeof value === 'string' && value.includes('%')) {
        const pct = parseFloat(value.replace('%', ''));
        return isNaN(pct) ? '' : pct / 100;
      }
      return value;

    case 'date':
      return value;

    default:
      return value.toString();
  }
}

// Generate Excel file from results - FIXED VERSION
async function generateExcelFile(results, metrics, analysisId) {
  console.log('Generating Excel file...');
  console.log('Metrics:', metrics);
  console.log('First result sample:', results[0]);

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Prepare data for worksheet
  const headers = ['Contract File', ...metrics.map(m => m.name)];

  const rows = results.map(result => {
    const row = [result.filename];

    // For each metric, get the value from the extracted data
    metrics.forEach(metric => {
      // Try multiple key variations to find the value
      let value = '';

      if (result.data) {
        // Try exact match first
        if (result.data[metric.name] !== undefined) {
          value = result.data[metric.name];
        }
        // Try case-insensitive match
        else {
          const dataKeys = Object.keys(result.data);
          const matchingKey = dataKeys.find(key => 
            key.toLowerCase() === metric.name.toLowerCase()
          );
          if (matchingKey) {
            value = result.data[matchingKey];
          }
        }
      }

      // If not found and there's an error, show error
      if (value === '' && result.error) {
        value = 'Error';
      }

      // Normalize the value based on type
      if (value !== '' && value !== 'Error') {
        value = normalizeValue(value, metric.type);
      }

      row.push(value);
    });

    return row;
  });

  console.log('Excel headers:', headers);
  console.log('First data row:', rows[0]);

  // Create worksheet data
  const wsData = [headers, ...rows];

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns
  const colWidths = headers.map((header, i) => {
    const columnData = [header, ...rows.map(row => row[i])];
    const maxLength = Math.max(...columnData.map(val => 
      val ? val.toString().length : 0
    ));
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
  });
  ws['!cols'] = colWidths;

  // Apply number formatting
  metrics.forEach((metric, i) => {
    const colIndex = i + 1; // Skip filename column

    for (let rowIndex = 1; rowIndex < wsData.length; rowIndex++) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });

      if (ws[cellAddress] && ws[cellAddress].v !== '') {
        if (metric.type === 'number') {
          ws[cellAddress].z = '#,##0';
          // Ensure it's stored as a number
          if (typeof ws[cellAddress].v === 'string') {
            const num = parseFloat(ws[cellAddress].v);
            if (!isNaN(num)) {
              ws[cellAddress].v = num;
              ws[cellAddress].t = 'n';
            }
          }
        } else if (metric.type === 'percentage') {
          ws[cellAddress].z = '0.00%';
          // Ensure it's stored as a number
          if (typeof ws[cellAddress].v === 'string') {
            const num = parseFloat(ws[cellAddress].v);
            if (!isNaN(num)) {
              ws[cellAddress].v = num;
              ws[cellAddress].t = 'n';
            }
          }
        }
      }
    }
  });

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Contract Waterfall');

  // Add a summary sheet
  const summaryData = [
    ['Contract Waterfall Analysis Summary'],
    [''],
    ['Generated:', new Date().toLocaleString()],
    ['Total Contracts:', results.length],
    ['Successful Extractions:', results.filter(r => !r.error).length],
    ['Failed Extractions:', results.filter(r => r.error).length],
    [''],
    ['Metrics Extracted:'],
    ...metrics.map(m => [`- ${m.name} (${m.type})`])
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Save file
  const outputDir = path.join('outputs');
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `contract_waterfall_${analysisId}.xlsx`);
  console.log('Saving Excel to:', outputPath);

  XLSX.writeFile(wb, outputPath);

  return outputPath;
}

// Cleanup uploaded files
async function cleanupFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error(`Failed to delete ${filePath}:`, error);
    }
  }
}

// Cleanup analysis results
async function cleanupAnalysis(analysisId) {
  const result = analysisResults.get(analysisId);
  if (result) {
    try {
      await fs.unlink(result.path);
    } catch (error) {
      console.error(`Failed to delete analysis file:`, error);
    }
    analysisResults.delete(analysisId);
  }
}

module.exports = router;