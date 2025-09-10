require('dotenv').config();
const axios = require('axios');

async function testAnthropicAPI() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ERROR: ANTHROPIC_API_KEY is not set in .env file');
    return;
  }
  
  console.log('Testing Anthropic API connection...');
  console.log(`API Key starts with: ${apiKey.substring(0, 20)}...`);
  
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: 'Say "API connection successful" in 5 words or less'
          }
        ]
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );
    
    console.log('✅ SUCCESS: API connection working!');
    console.log('Response:', response.data.content[0].text);
  } catch (error) {
    console.error('❌ ERROR:', error.response?.status || error.message);
    if (error.response?.status === 401) {
      console.error('The API key is invalid or expired. Please check your .env file.');
      console.error('Get a new API key from: https://console.anthropic.com/');
    }
    if (error.response?.data) {
      console.error('Error details:', error.response.data);
    }
  }
}

testAnthropicAPI();