const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const pdfParse = require('pdf-parse');

// API Keys - use environment variables or fallback to hardcoded
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || "aa20d81d-9606-4910-8e58-4c7f957c48dc";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "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";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "sk_a63e3349ffbd6bd0f13ead72d06799050b08eb38eceed0f6";

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

// Main generate endpoint - complete pipeline
router.post('/generate', upload.single('pdf'), async (req, res) => {
  console.log('Received podcast generation request');
  
  if (!req.file) {
    console.error('No file uploaded');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log(`File uploaded: ${req.file.originalname}, size: ${req.file.size} bytes`);

  try {
    console.log('Starting PDF podcast generation pipeline...');

    // Step 1: Translate PDF with DeepL
    console.log('Step 1: Translating PDF with DeepL...');
    const { document_id, document_key } = await uploadPDFToDeepL(req.file.path);
    console.log(`DeepL document uploaded - ID: ${document_id}`);
    
    await waitForTranslation(document_id, document_key);
    const translatedPDF = await downloadTranslatedPDF(document_id, document_key);
    console.log('PDF translation completed successfully');

    // Save translated PDF
    const translatedPdfFilename = `translated_${Date.now()}.pdf`;
    const translatedPdfPath = path.join('outputs', translatedPdfFilename);
    await fs.mkdir('outputs', { recursive: true });
    await fs.writeFile(translatedPdfPath, translatedPDF);

    // Step 2: Generate summary and podcast script with Claude
    console.log('Step 2: Generating summary and podcast script with Claude...');
    const { summary, podcastScript } = await generateContentWithClaude(translatedPDF);

    // Save summary
    const summaryFilename = `summary_${Date.now()}.txt`;
    const summaryPath = path.join('outputs', summaryFilename);
    await fs.writeFile(summaryPath, summary);

    // Step 3: Generate audio with ElevenLabs
    console.log('Step 3: Generating audio with ElevenLabs...');
    const audioBuffer = await generateAudioWithElevenLabs(podcastScript);

    // Save audio
    const audioFilename = `podcast_${Date.now()}.mp3`;
    const audioPath = path.join('outputs', audioFilename);
    await fs.writeFile(audioPath, audioBuffer);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    // Return response in expected format
    res.json({
      success: true,
      translatedPdfUrl: `/api/podcast/download/${translatedPdfFilename}`,
      summary: summary,
      summaryUrl: `/api/podcast/download/${summaryFilename}`,
      podcastUrl: `/api/podcast/download/${audioFilename}`
    });

  } catch (error) {
    console.error('Pipeline error:', error);
    console.error('Error stack:', error.stack);
    
    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    
    // Provide more specific error messages
    let errorMessage = 'Failed to generate podcast';
    let statusCode = 500;
    
    if (error.message.includes('DeepL')) {
      errorMessage = 'Translation service error: ' + error.message;
    } else if (error.message.includes('Claude')) {
      errorMessage = 'AI content generation error: ' + error.message;
    } else if (error.message.includes('ElevenLabs')) {
      errorMessage = 'Audio generation error: ' + error.message;
    } else {
      errorMessage = 'Server error: ' + error.message;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Step 1: Upload PDF to DeepL
async function uploadPDFToDeepL(filePath) {
  try {
    const form = new FormData();
    const fileStream = require('fs').createReadStream(filePath);

    // Set up form fields exactly as shown in DeepL docs
    form.append('target_lang', 'EN');
    form.append('source_lang', 'IT');
    form.append('file', fileStream, 'document.pdf');

    const response = await axios.post(
      'https://api.deepl.com/v2/document',
      form,
      {
        headers: {
          'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          'User-Agent': 'PodcastApp/1.0.0',
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    console.log('Upload successful:', response.data);
    return response.data;

  } catch (error) {
    if (error.response) {
      console.error('DeepL error response:', error.response.status, error.response.data);
      const errorMsg = error.response.data?.message || error.response.statusText || 'Unknown error';
      throw new Error(`DeepL upload failed: ${errorMsg}`);
    }
    console.error('DeepL upload error:', error.message);
    throw new Error(`DeepL upload failed: ${error.message}`);
  }
}

// Wait for translation to complete
async function waitForTranslation(documentId, documentKey) {
  const maxAttempts = 60;
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.post(
        `https://api.deepl.com/v2/document/${documentId}`,
        { document_key: documentKey },
        {
          headers: {
            'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
            'User-Agent': 'PodcastApp/1.0.0',
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`Status: ${response.data.status}`);

      if (response.data.status === 'done') {
        console.log(`Translation complete. Billed characters: ${response.data.billed_characters}`);
        return;
      } else if (response.data.status === 'error') {
        throw new Error(response.data.message || 'Translation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

    } catch (error) {
      if (error.response) {
        throw new Error(`Status check failed: ${error.response.data.message}`);
      }
      throw error;
    }
  }

  throw new Error('Translation timeout');
}

// Download translated PDF
async function downloadTranslatedPDF(documentId, documentKey) {
  try {
    console.log(documentId);
    const response = await axios.post(
      `https://api.deepl.com/v2/document/${documentId}/result`,
      { document_key: documentKey },
      {
        headers: {
          'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          'User-Agent': 'PodcastApp/1.0.0',
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );
    console.log(response.data);
    console.log('Downloaded translated PDF successfully');
    return Buffer.from(response.data);

  } catch (error) {
    if (error.response) {
      throw new Error(`Download failed: ${error.response.statusText}`);
    }
    throw error;
  }
}

// Step 2: Generate content with Claude
async function generateContentWithClaude(pdfBuffer) {
  try {
    // Parse PDF to extract text
    console.log('Parsing PDF for text extraction...');
    const pdfData = await pdfParse(pdfBuffer);
    const pdfText = pdfData.text;
    console.log(`Extracted ${pdfText.length} characters from PDF`);

    if (!pdfText || pdfText.length < 100) {
      throw new Error('PDF text extraction failed or document is too short');
    }

    // Truncate text if it's too long for the API
    const maxTextLength = 150000; // Claude can handle ~200k tokens, this is safe
    const documentText = pdfText.length > maxTextLength 
      ? pdfText.substring(0, maxTextLength) + '\n\n[Document truncated due to length...]'
      : pdfText;

    const prompt = `Please analyze this translated document and provide:

1. A comprehensive one-page summary that captures the key points, main arguments, and important details. Be thorough but concise.

2.  A podcast script that efficiently presents all relevant information from the document.

For the podcast script:
- Write as a professional business news anchor delivering a briefing
- Start directly with the most important information - no storytelling hooks needed
- Present information in a clear, organized manner like an earnings call or info briefing
- Use precise terminology that you need - the audience is sophisticated PE professionals
- Include specific numbers, percentages, and financial metrics
- Structure topics logically with brief transitions (e.g., "Turning to operations..." or "On the financial side...")
- Maintain an informative, neutral tone throughout
- Cover all material points from the document - completeness is more important than time constraints
- End with a concise summary of key considerations

Format your response EXACTLY as:

SUMMARY:
[Your detailed summary here]

---SCRIPT---
[Your podcast script here]

Document content:
${documentText}`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: prompt
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

    const fullResponse = response.data.content[0].text;

    // Parse the response
    const summaryMatch = fullResponse.match(/SUMMARY:\s*([\s\S]*?)(?=---SCRIPT---|$)/);
    const scriptMatch = fullResponse.match(/---SCRIPT---\s*([\s\S]*?)$/);

    if (!summaryMatch || !scriptMatch) {
      // Fallback parsing
      const parts = fullResponse.split('---SCRIPT---');
      const summary = parts[0].replace('SUMMARY:', '').trim();
      const podcastScript = parts[1] ? parts[1].trim() : 'Script generation failed';
      return { summary, podcastScript };
    }

    const summary = summaryMatch[1].trim();
    const podcastScript = scriptMatch[1].trim();

    console.log('Content generation successful');
    return { summary, podcastScript };

  } catch (error) {
    if (error.response) {
      console.error('Claude API error response:', error.response.status, error.response.data);
      const errorMsg = error.response.data?.error?.message || error.response.data?.message || error.response.statusText || 'Unknown error';
      throw new Error(`Claude API failed: ${errorMsg}`);
    }
    console.error('Claude API error:', error.message);
    throw new Error(`Claude API failed: ${error.message}`);
  }
}

// Step 3: Generate audio with ElevenLabs
async function generateAudioWithElevenLabs(script) {
  try {
    // Use Rachel voice for professional sound
    const voiceId = '21m00Tcm4TlvDq8ikWAM';

    // ElevenLabs has a 5000 character limit per request
    if (script.length > 5000) {
      console.warn(`Script is ${script.length} characters, truncating to 5000`);
      script = script.substring(0, 4900) + "... Thank you for listening!";
    }

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.85,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    console.log('Audio generation successful');
    return Buffer.from(response.data);

  } catch (error) {
    if (error.response) {
      console.error('ElevenLabs API error:', error.response.status, error.response.statusText);
      if (error.response.data) {
        console.error('ElevenLabs error details:', error.response.data);
      }
      const errorMsg = error.response.data?.detail?.message || error.response.statusText || 'Unknown error';
      throw new Error(`ElevenLabs API failed: ${errorMsg}`);
    }
    console.error('ElevenLabs error:', error.message);
    throw new Error(`ElevenLabs API failed: ${error.message}`);
  }
}

// Download endpoint (handles PDF, TXT, and MP3)
router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join('outputs', filename);

    // Check if file exists
    await fs.access(filepath);

    // Determine content type based on extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';

    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.txt') {
      contentType = 'text/plain';
    } else if (ext === '.mp3') {
      contentType = 'audio/mpeg';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = require('fs').createReadStream(filepath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;