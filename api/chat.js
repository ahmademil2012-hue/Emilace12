// Tambahkan ini agar batas waktu di Vercel lebih lama (Jika paket Pro)
// export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // 1. Set CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, baseUrl, model, messages, webSearch } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API Key kosong' });
  }

  let finalMessages = [...messages];

  // 2. FITUR PENCARIAN WEB (Dengan Timeout Anti-Crash Vercel)
  if (webSearch && messages.length > 0) {
    try {
      const lastUserMsg = messages[messages.length - 1].content;
      const searchUrl = `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(lastUserMsg)}`;
      
      // Timeout 5 detik (5000ms) untuk mencegah Vercel timeout 10 detik
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const searchRes = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeoutId); // Hentikan timer jika selesai

      const searchText = await searchRes.text();
      const context = searchText.substring(0, 4000); // Batasi token
      
      finalMessages.unshift({
        role: "system",
        content: `Kamu adalah asisten AI. Berikut adalah hasil pencarian web untuk "${lastUserMsg}":\n\n${context}\n\nJawablah pertanyaan user berdasarkan informasi di atas.`
      });
    } catch (e) {
      console.error("Gagal mencari di web (Timeout/Error):", e.message);
      // Jika gagal search, biarkan saja lanjut ke AI tanpa context web
    }
  }

  // 3. KIRIM KE API KUNCIAI
  try {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, ''); 
    const targetUrl = `${cleanBaseUrl}/chat/completions`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: finalMessages,
        stream: false 
      })
    });

    const dataText = await response.text(); 

    if (!response.ok) {
      return res.status(response.status).json({ error: `KunciAI Error: ${dataText}` });
    }

    let dataJson;
    try {
      dataJson = JSON.parse(dataText);
    } catch (e) {
      return res.status(500).json({ error: `Format bukan JSON: ${dataText.substring(0, 50)}` });
    }

    // 4. Kirim balik jawaban AI ke Frontend
    res.status(200).json(dataJson);

  } catch (error) {
    res.status(500).json({ error: 'Server Vercel Gagal', detail: error.message });
  }
}