// Quick test to check which APIs work
const geminiKey = process.env.GEMINI_API_KEY || '';
const cohereKey = process.env.COHERE_API_KEY || '';

async function testGeminiEmbed() {
  console.log('\n--- Testing Gemini Embedding API ---');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-2',
          content: { parts: [{ text: 'test embedding' }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768
        })
      }
    );
    const data = await res.json();
    if (res.ok) {
      console.log('✅ Gemini Embedding: OK');
      console.log('   Dimension:', data.embedding?.values?.length);
    } else {
      console.log('❌ Gemini Embedding FAILED:', res.status, JSON.stringify(data).slice(0, 300));
    }
  } catch (e) {
    console.log('❌ Gemini Embedding ERROR:', e.message);
  }
}

async function testGeminiChat() {
  console.log('\n--- Testing Gemini Chat API ---');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hello in one word' }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 50 }
        })
      }
    );
    const data = await res.json();
    if (res.ok) {
      console.log('✅ Gemini Chat: OK');
      console.log('   Response:', data.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 100));
    } else {
      console.log('❌ Gemini Chat FAILED:', res.status, JSON.stringify(data).slice(0, 300));
    }
  } catch (e) {
    console.log('❌ Gemini Chat ERROR:', e.message);
  }
}

async function testCohereEmbed() {
  console.log('\n--- Testing Cohere Embedding API ---');
  try {
    const res = await fetch('https://api.cohere.com/v1/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cohereKey}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        texts: ['test embedding'],
        model: 'embed-english-v3.0',
        input_type: 'search_document'
      })
    });
    const data = await res.json();
    if (res.ok) {
      console.log('✅ Cohere Embedding: OK');
      console.log('   Dimension:', data.embeddings?.[0]?.length);
    } else {
      console.log('❌ Cohere Embedding FAILED:', res.status, JSON.stringify(data).slice(0, 300));
    }
  } catch (e) {
    console.log('❌ Cohere Embedding ERROR:', e.message);
  }
}

async function testCohereChat() {
  console.log('\n--- Testing Cohere Chat API ---');
  try {
    const res = await fetch('https://api.cohere.com/v1/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cohereKey}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        message: 'Say hello in one word',
        model: 'command-r',
        temperature: 0.1
      })
    });
    const data = await res.json();
    if (res.ok) {
      console.log('✅ Cohere Chat: OK');
      console.log('   Response:', data.text?.slice(0, 100));
    } else {
      console.log('❌ Cohere Chat FAILED:', res.status, JSON.stringify(data).slice(0, 300));
    }
  } catch (e) {
    console.log('❌ Cohere Chat ERROR:', e.message);
  }
}

async function main() {
  console.log('=== VectorMind API Diagnostics ===');
  await testGeminiEmbed();
  await testGeminiChat();
  await testCohereEmbed();
  await testCohereChat();
  console.log('\n=== Done ===');
}

main();
