(() => {
  const Furigana = (globalThis.Furigana = globalThis.Furigana || {});

  const SYSTEM_PROMPT = [
    'Annotate Japanese lyrics with HTML ruby tags. Return ONLY the annotated HTML, nothing else.',
    '',
    '- Wrap every kanji or kanji compound in <ruby>漢字<rt>よみ</rt></ruby> using hiragana readings.',
    '- Keep okurigana outside: <ruby>食<rt>た</rt></ruby>べる, not <ruby>食べ<rt>たべ</rt></ruby>る.',
    '- Group kanji compounds naturally: <ruby>夜空<rt>よぞら</rt></ruby>, not <ruby>夜<rt>よ</rt></ruby><ruby>空<rt>ぞら</rt></ruby>.',
    '- Leave kana, punctuation, Latin letters, and numbers unchanged. Preserve blank lines and line breaks with <br>.',
    '- Pick contextually accurate readings for lyrics (including poetic/song readings when clear).',
    '- Annotate the ENTIRE input from start to finish without summarizing or stopping early.',
  ].join('\n');

  /**
   * Call an OpenAI-compatible chat completions endpoint with streaming support.
   * Invokes `onChunk(sanitizedHtml)` as tokens arrive, and returns the final sanitized HTML.
   */
  async function annotateLyrics({ apiKey, baseUrl, model, lyrics, signal, onChunk }) {
    const { sanitizeRubyHtml } = Furigana.ruby;
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

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
        temperature: 0.1,
        max_tokens: 16384,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
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

  Furigana.api = { annotateLyrics };
})();
