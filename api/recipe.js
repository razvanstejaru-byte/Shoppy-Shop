module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Metodă nepermisă' });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Lipsește OPENAI_API_KEY în setările Vercel.' });
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
    const systemPrompt = "Ești un asistent culinar care răspunde strict în format JSON valid, având exact structura: {\"recipe\": \"textul rețetei în limba română\", \"missing\": [\"ingredient1\", \"ingredient2\"]}. Fără markdown suplimentar sau alte texte în afara JSON-ului.";
    const userPrompt = dish
      ? `Utilizatorul vrea să gătească: "${dish}". Ingrediente în coș: ${have}. Generează rețeta și ingredientele lipsă strict necesare.`
      : `Ingrediente în coș: ${have}. Propune o rețetă simplă bazată pe ele și identifică ce mai lipsește.`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });

    const data = await r.json();
    if (!r.ok || data.error) {
      return res.status(502).json({ error: (data.error && data.error.message) || 'Eroare de la OpenAI' });
    }

    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return res.status(200).json({
      recipe: String(parsed.recipe || 'Nu s-a putut genera rețeta.'),
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
    });
  } catch (e) {
    return res.status(500).json({ error: 'Eroare internă server: ' + (e && e.message ? e.message : e) });
  }
};
