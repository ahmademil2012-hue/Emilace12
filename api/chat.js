export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  const { action, apiKey, baseUrl, model, messages, webSearch, key, apiId } = req.body;

  // ===== 1. FITUR BACA SETELAN DARI GITHUB =====
  if (action === 'getConfig') {
    const githubToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';
    const url = `https://api.github.com/repos/${repo}/contents/config.json?ref=${branch}`;
    try {
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${githubToken}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Gagal ambil config');
      const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
      return res.status(200).json(content);
    } catch (error) { return res.status(500).json({ error: error.message }); }
  }

  // ===== 2. FITUR SIMPAN SETELAN KE GITHUB =====
  if (action === 'saveConfig') {
    const githubToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';
    const url = `https://api.github.com/repos/${repo}/contents/config.json?ref=${branch}`;
    try {
      const getRes = await fetch(url, { headers: { 'Authorization': `Bearer ${githubToken}` } });
      const getData = await getRes.json();
      const sha = getData.sha;
      let currentConfig = JSON.parse(Buffer.from(getData.content, 'base64').toString('utf-8'));
      currentConfig[key] = apiId;

      const updateRes = await fetch(`https://api.github.com/repos/${repo}/contents/config.json`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${githubToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Update ${key} to ${apiId}`,
          content: Buffer.from(JSON.stringify(currentConfig, null, 2)).toString('base64'),
          sha: sha,
          branch: branch
        })
      });
      if (!updateRes.ok) throw new Error("Gagal update GitHub");
      return res.status(200).json({ success: true });
    } catch (error) { return res.status(500).json({ error: error.message }); }
  }

  // ===== 3. FITUR TARIK DAFTAR MODEL =====
  if (action === 'getModels') {
    if (!apiKey) return res.status(400).json({ error: 'API Key kosong' });
    try {
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      const response = await fetch(`${cleanBaseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (error) { return res.status(500).json({ error: 'Gagal mengambil model: ' + error.message }); }
  }

  // ===== 4. FITUR CHAT BIASA =====
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
      if (response.status === 404) return res.status(404).json({ error: `Model "${model}" tidak ditemukan.` });
      return res.status(response.status).json({ error: `KunciAI Error: ${dataText}` });
    }

    let dataJson;
    try { dataJson = JSON.parse(dataText); } 
    catch (e) { return res.status(500).json({ error: `Format bukan JSON: ${dataText.substring(0, 50)}` }); }

    res.status(200).json(dataJson);

  } catch (error) { res.status(500).json({ error: 'Server Vercel Gagal', detail: error.message }); }
}