const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const openaiKey = process.env.OPENAI_API_KEY;
console.log('API Key length:', openaiKey ? openaiKey.length : 0);
console.log('API Key preview:', openaiKey ? `${openaiKey.substring(0, 12)}...` : 'undefined');

async function testOpenAI() {
  if (!openaiKey) {
    console.error('No OpenAI Key found in environment!');
    return;
  }
  
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 10
      })
    });
    
    console.log('Status code:', res.status);
    const data = await res.json();
    console.log('Response body:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

testOpenAI();
