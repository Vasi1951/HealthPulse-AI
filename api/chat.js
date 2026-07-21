/**
 * @fileoverview Vercel Serverless Function — OpenRouter API Proxy.
 * Securely proxies chat requests to OpenRouter so the API key
 * stays server-side and is never exposed to the browser.
 */

const SYSTEM_PROMPT = `You are HealthPulse AI, a knowledgeable and empathetic health information assistant. Your role is to:

1. Provide accurate, evidence-based general health information
2. Explain medical symptoms, conditions, and terminology in plain language
3. Suggest preventive care practices and healthy lifestyle habits
4. Help users understand when they should seek professional medical care
5. Answer questions about medications at a general informational level only
6. Provide first aid guidance for minor, non-emergency situations

IMPORTANT RULES you must always follow:
- NEVER diagnose a specific medical condition in an individual
- NEVER recommend specific prescription medications for personal use
- ALWAYS recommend consulting a healthcare professional for personal symptoms
- If a user describes emergency symptoms (chest pain, difficulty breathing, stroke symptoms, severe bleeding, loss of consciousness), IMMEDIATELY direct them to call emergency services (911 in the US or local equivalent)
- Be warm, empathetic, and non-alarmist — health anxiety is real
- Use simple, clear language — avoid jargon unless you explain it
- Structure your responses with clear headings and bullet points when helpful
- Keep responses focused and appropriately concise

Format your responses in Markdown.`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing API key' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Build the full messages array with system prompt
    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-20), // Keep last 20 messages (10 pairs)
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': req.headers.referer || req.headers.origin || 'https://healthpulse-ai.vercel.app',
        'X-Title': 'HealthPulse AI',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-6',
        max_tokens: 1024,
        messages: fullMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({
        error: `API error: ${response.status}`,
        detail: errorBody,
      });
    }

    // Stream the response through to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } finally {
      reader.releaseLock();
    }

    res.end();
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
