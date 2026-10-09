module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Metodă nepermisă' });
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Lipsește GEMINI_API_KEY în setările Vercel.' });
    }

    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
    }

    const dish = String(body.dish || '').trim().slice(0, 200);
    const products = (Array.isArray(body.products) ? body.products : [])
      .map(p => String(p).trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 100);

    if (!dish && products.length === 0) {
      return res.status(400).json({ error: 'Trimite un preparat sau ingrediente' });
    }

    const have = products.length ? products.join(', ') : 'niciunul';
    const prompt = dish
      ? `Utilizatorul vrea să gătească: "${dish}". Ingrediente în coș: ${have}. Generează o rețetă în limba română și identifică ingredientele lipsă strict necesare. Răspunde strict în format JSON valid, având structura: {"recipe": "textul rețetei", "missing": ["ingredient1", "ingredient2"]}.`
      : `Ingrediente în coș: ${have}. Propune o rețetă simplă în limba română bazată pe ele și identifică ce mai lipsește. Răspunde strict în format JSON valid, având structura: {"recipe": "textul rețetei", "missing": ["ingredient1", "ingredient2"]}.`;

    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            thinkingConfig: {
              thinkingBudget: 0
            },
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = await r.json();
    if (!r.ok || data.error) {
      return res.status(502).json({ error: (data.error && data.error.message) || 'Eroare de la serverul Gemini' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanText = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanText);

    return res.status(200).json({
      recipe: String(parsed.recipe || 'Nu s-a putut genera rețeta.'),
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
    });
  } catch (e) {
    return res.status(500).json({ error: 'Eroare internă server: ' + (e && e.message ? e.message : e) });
  }
};
