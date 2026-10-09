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
      const nume = Object.keys(process.env).filter(k => /GEM|API|KEY/i.test(k));
      return res.status(500).json({
        error: 'Lipsește GEMINI_API_KEY. Variabile găsite: ' + (nume.join(', ') || 'niciuna'),
      });
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
      ? `Utilizatorul vrea să gătească: "${dish}".
Ingredientele din coș: ${have}.
Folosește cu precădere ingredientele din coș. Pune în "missing" DOAR ingredientele strict necesare care nu sunt în coș, fără opționale.`
      : `Ingredientele din coș: ${have}.
Propune o rețetă simplă bazată pe aceste ingrediente. Pune în "missing" DOAR ce este strict necesar ca rețeta să poată fi gătită.`;

    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt + '\nRăspunde în limba română.' }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                recipe: { type: 'STRING' },
                missing: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['recipe', 'missing'],
            },
          },
        }),
      }
    );

    const data = await r.json();
    if (!r.ok || data.error) {
      return res.status(502).json({ error: (data.error && data.error.message) || 'Eroare Gemini' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    return res.status(200).json({
      recipe: String(parsed.recipe || ''),
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
    });
  } catch (e) {
    return res.status(500).json({ error: 'Eroare internă: ' + (e && e.message ? e.message : e) });
  }
};
