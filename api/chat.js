export default async function handler(req, res) {
  // 1. Set Header CORS biar aman dari blokiran browser
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // 2. Handle preflight request (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. Hanya izinkan method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 4. Ambil data yang dikirim dari Frontend HTML
  const { apiKey, baseUrl, model, messages, webSearch } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API Key kosong' });
  }

  let finalMessages = [...messages];

  // 5. LOGIKA PENCARIAN WEB (Jika tombol "Pencarian Web" di-ON kan)
  if (webSearch && messages.length > 0) {
    try {
      const lastUserMsg = messages[messages.length - 1].content;
      
      // Pakai Jina AI Reader untuk cari di DuckDuckGo
      const searchUrl = `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(lastUserMsg)}`;
      const searchRes = await fetch(searchUrl);
      const searchText = await searchRes.text();
      
      // Batasi konteks biar ga kebablasan token (maks 4000 karakter)
      const context = searchText.substring(0, 4000);
      
      // Sisipkan hasil pencarian ke dalam prompt sebagai pesan sistem
      finalMessages.unshift({
        role: "system",
        content: `Kamu adalah asisten AI. Berikut adalah hasil pencarian web untuk "${lastUserMsg}":\n\n${context}\n\nJawablah pertanyaan user berdasarkan informasi di atas. Jika tidak ada di atas, jawab dengan pengetahuanmu.`
      });
    } catch (e) {
      console.error("Gagal mencari di web:", e);
      // Kalau gagal nyari, lanjut aja tanpa web search
    }
  }

  // 6. KIRIM KE API KUNCIAI
  try {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, ''); // Hapus slash di akhir kalau ada
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
        stream: false // Matikan stream biar stabil di Vercel
      })
    });

    const dataText = await response.text(); 

    if (!response.ok) {
      return res.status(response.status).json({ error: `KunciAI: ${dataText}` });
    }

    let dataJson;
    try {
      dataJson = JSON.parse(dataText);
    } catch (e) {
      return res.status(500).json({ error: `Format bukan JSON: ${dataText.substring(0, 50)}` });
    }

    // 7. Kirim balik jawaban AI ke Frontend
    res.status(200).json(dataJson);

  } catch (error) {
    res.status(500).json({ error: 'Server Vercel Gagal', detail: error.message });
  }
}