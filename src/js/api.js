(() => {
  const Furigana = (globalThis.Furigana = globalThis.Furigana || {});

  const BASE_RUBY_RULES = [
    '- Wrap every kanji or kanji compound in <ruby>漢字<rt>よみ</rt></ruby> using hiragana readings.',
    '- Keep okurigana outside: <ruby>食<rt>た</rt></ruby>べる, not <ruby>食べ<rt>たべ</rt></ruby>る.',
    '- Group kanji compounds naturally: <ruby>夜空<rt>よぞら</rt></ruby>, not <ruby>夜<rt>よ</rt></ruby><ruby>空<rt>ぞら</rt></ruby>.',
    '- Leave kana, punctuation, Latin letters, and numbers unchanged.',
    '- Pick contextually accurate readings for lyrics (including poetic/song readings when clear).',
    '- Annotate the ENTIRE input from start to finish without summarizing or stopping early.',
  ];

  const SYSTEM_PROMPT_RUBY_ONLY = [
    'Annotate Japanese lyrics with HTML ruby tags. Return ONLY the annotated HTML, nothing else.',
    '',
    ...BASE_RUBY_RULES,
    '- Preserve blank lines and line breaks with <br>.',
  ].join('\n');

  const TRANSLATION_STYLE_INSTRUCTIONS = {
    natural: [
      '- Read the full stanza and song context before translating so sentences split across multiple lines flow naturally and cohesively.',
      '- Translate into idiomatic, fluent, emotionally resonant Simplified Chinese suitable for song lyrics; prioritize natural expression, imagery, and rhythm over stiff word-for-word literal phrasing.',
    ],
    literal: [
      '- Provide a faithful, line-by-line literal Simplified Chinese translation that closely preserves the original Japanese wording, structure, and clause correspondence for language learners.',
    ],
  };

  function buildSystemPrompt({ translate = true, translationStyle = 'natural' } = {}) {
    if (!translate) return SYSTEM_PROMPT_RUBY_ONLY;

    const styleKey = translationStyle === 'literal' ? 'literal' : 'natural';
    const styleRules = TRANSLATION_STYLE_INSTRUCTIONS[styleKey];
    return [
      'Annotate Japanese lyrics with HTML ruby tags and provide a Simplified Chinese translation below each lyric line. Return ONLY the HTML, nothing else.',
      '',
      ...BASE_RUBY_RULES,
      ...styleRules,
      '- Immediately after each non-empty lyric line, output its Simplified Chinese translation on the next line wrapped in <p>中文翻译</p> (plain text inside <p>, no ruby tags inside <p>).',
      '- Preserve blank lines between stanzas as an empty line between entries.',
      '- Example format:',
      '<ruby>夢<rt>ゆめ</rt></ruby>を<ruby>見<rt>み</rt></ruby>たんだ',
      '<p>曾做过一场梦</p>',
    ].join('\n');
  }

  /**
   * Fetch available model IDs from an OpenAI-compatible `/models` endpoint (e.g. DeepSeek API).
   */
  async function fetchModels({ apiKey, baseUrl, signal }) {
    const cleanKey = (apiKey || '').trim();
    const cleanBase = (baseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanKey) throw new Error('请先填写 API Key');
    if (!cleanBase) throw new Error('请先填写 API Base URL');

    const response = await fetch(`${cleanBase}/models`, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        message = errData?.error?.message || errData?.message || message;
      } catch {
        // keep status code fallback
      }
      throw new Error(`拉取模型失败：${message}`);
    }

    const payload = await response.json();
    const list = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];

    const ids = [...new Set(list.map((item) => (typeof item === 'string' ? item : item?.id)).filter(Boolean))].sort();
    if (ids.length === 0) {
      throw new Error('接口未返回任何可用模型，可改用「手动输入模型 ID」');
    }
    return ids;
  }

  /**
   * Call an OpenAI-compatible chat completions endpoint with streaming support.
   * Invokes `onChunk(sanitizedHtml)` as tokens arrive, and returns the final sanitized HTML.
   */
  async function annotateLyrics({
    apiKey,
    baseUrl,
    model,
    lyrics,
    translate = true,
    translationStyle = 'natural',
    signal,
    onChunk,
  }) {
    const { sanitizeRubyHtml } = Furigana.ruby;
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const systemPrompt = buildSystemPrompt({ translate, translationStyle });
    const temperature = translate && translationStyle !== 'literal' ? 0.3 : 0.1;

    const response = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature,
        max_tokens: 16384,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: lyrics },
        ],
      }),
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        message = errData?.error?.message || errData?.message || message;
      } catch {
        // keep status text fallback
      }
      throw new Error(`接口请求失败：${message}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // Fallback for non-streaming JSON responses
    if (!contentType.includes('text/event-stream') || !response.body) {
      const data = await response.json();
      const choice = data?.choices?.[0];
      if (choice?.finish_reason === 'length') {
        throw new Error('输出达到长度上限，请将歌词分段后重试。');
      }
      const finalHtml = sanitizeRubyHtml(choice?.message?.content || '');
      onChunk?.(finalHtml);
      return finalHtml;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let rawAccumulated = '';
    let finishReason = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const choice = parsed?.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta?.content;
          if (delta) {
            rawAccumulated += delta;
            onChunk?.(sanitizeRubyHtml(rawAccumulated));
          }
        } catch {
          // Ignore malformed partial SSE frames
        }
      }
    }

    if (finishReason === 'length') {
      throw new Error('输出达到长度上限，请将歌词分段后重试。');
    }

    const finalHtml = sanitizeRubyHtml(rawAccumulated);
    onChunk?.(finalHtml);
    return finalHtml;
  }

  Furigana.api = { fetchModels, annotateLyrics, buildSystemPrompt };
})();
