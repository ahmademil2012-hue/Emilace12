export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  if (req.body && req.body.action === 'getModels') {
    const { apiKey, baseUrl } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API Key kosong' });

    try {
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      const response = await fetch(`${cleanBaseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Gagal mengambil model: ' + error.message });
    }
  }

  const { apiKey, baseUrl, model, messages, webSearch } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key kosong' });

  let finalMessages = [...messages];

  if (webSearch && messages.length > 0) {
    try {
      const lastUserMsg = messages[messages.length - 1].content;
      const searchUrl = `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(lastUserMsg)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const searchRes = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const searchText = await searchRes.text();
      const context = searchText.substring(0, 4000);
      finalMessages.unshift({ role: "system", content: `Kamu adalah asisten AI. Berikut adalah hasil pencarian web untuk "${lastUserMsg}":\n\n${context}\n\nJawablah pertanyaan user berdasarkan informasi di atas.` });
    } catch (e) { console.error("Gagal mencari di web:", e.message); }
  }

  try {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const targetUrl = `${cleanBaseUrl}/chat/completions`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model, messages: finalMessages, stream: false })
    });

    const dataText = await response.text();

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: `Model "${model}" tidak ditemukan.` });
      }
      return res.status(response.status).json({ error: `KunciAI Error: ${dataText}` });
    }

    let dataJson;
    try { dataJson = JSON.parse(dataText); } 
    catch (e) { return res.status(500).json({ error: `Format bukan JSON: ${dataText.substring(0, 50)}` }); }

    res.status(200).json(dataJson);

  } catch (error) { res.status(500).json({ error: 'Server Vercel Gagal', detail: error.message }); }
}