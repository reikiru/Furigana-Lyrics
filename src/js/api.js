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

  const TRANSLATION_PROMPTS = {
    natural: [
      '你是一位精通日文歌曲与汉语诗意表达的专业歌词译者。请先通读整首歌词，理解全曲情绪、意象与跨行长句的上下文，再将其翻译为自然流畅、富有歌词美感的简体中文。',
      '',
      '翻译原则：',
      '- 避免机械翻译腔：遵循汉语意合习惯，自然省略冗余主语与代词，切忌在相邻两句里重复堆砌「我」「你」「这」「那」。',
      '- 避免生硬连接词与书面客套话：不要动辄机械翻出「虽然…」「尽管…」「明明…」「但是…」，也不要把歌词翻成公文或客套腔（例如避免「实在万分抱歉」这类表达）。',
      '- 保持重复句与段落呼应：歌词中反复吟唱或呼应的句子，译文应保持节奏与意象的呼应，不要强行换词凑数。',
      '- 兼顾跨行连贯与逐行对齐：跨行长句可在语义上前后贯通，同时仍按原行拆分成对应的中文行。',
      '- 严格按输入编号输出：每行格式为 `[编号] 中文译文`（例如 `[1] 试着活到了今天`），编号数量必须与输入完全一致；只输出编号与中文译文，不要输出日文原文、解释说明或 Markdown 代码块。',
    ].join('\n'),
    literal: [
      '你是一位严谨的日语教学译者。请将以下带编号的日语歌词逐句直译为简体中文，尽量贴近原文词序、语法结构与字面含义，方便日语学习者逐句对照。',
      '',
      '- 严格按输入编号输出：每行格式为 `[编号] 中文译文`，编号数量必须与输入完全一致；只输出编号与中文译文，不要输出日文原文、解释说明或 Markdown 代码块。',
    ].join('\n'),
  };

  function buildSystemPrompt() {
    return SYSTEM_PROMPT_RUBY_ONLY;
  }

  function buildTranslationPrompt(translationStyle = 'natural') {
    const key = translationStyle === 'literal' ? 'literal' : 'natural';
    return TRANSLATION_PROMPTS[key];
  }

  function formatNumberedLyrics(lyrics) {
    let idx = 0;
    return lyrics
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => {
        if (line.trim() === '') return '';
        idx += 1;
        return `[${idx}] ${line.trim()}`;
      })
      .join('\n');
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
   * Stream a single OpenAI-compatible chat completion and return the raw accumulated text.
   */
  async function streamChatCompletion({
    apiKey,
    baseUrl,
    model,
    systemPrompt,
    userContent,
    temperature,
    signal,
    onRawChunk,
  }) {
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
        temperature,
        max_tokens: 16384,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
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
      const raw = choice?.message?.content || '';
      onRawChunk?.(raw);
      return raw;
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
            onRawChunk?.(rawAccumulated);
          }
        } catch {
          // Ignore malformed partial SSE frames
        }
      }
    }

    if (finishReason === 'length') {
      throw new Error('输出达到长度上限，请将歌词分段后重试。');
    }

    onRawChunk?.(rawAccumulated);
    return rawAccumulated;
  }

  /**
   * Annotate Japanese lyrics with ruby tags, and optionally run a parallel holistic
   * Simplified Chinese translation request that merges line-by-line into the ruby HTML.
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
    const {
      sanitizeRubyHtml,
      parseNumberedTranslations,
      mergeRubyWithTranslations,
    } = Furigana.ruby;

    if (!translate) {
      const rawRuby = await streamChatCompletion({
        apiKey,
        baseUrl,
        model,
        systemPrompt: buildSystemPrompt(),
        userContent: lyrics,
        temperature: 0.1,
        signal,
        onRawChunk: (raw) => onChunk?.(sanitizeRubyHtml(raw)),
      });
      const finalHtml = sanitizeRubyHtml(rawRuby);
      onChunk?.(finalHtml);
      return finalHtml;
    }

    let latestRubyHtml = '';
    let latestTranslations = {};

    const emitMerged = () => {
      if (!latestRubyHtml.trim()) return;
      onChunk?.(mergeRubyWithTranslations(latestRubyHtml, latestTranslations));
    };

    const transTemperature = translationStyle === 'literal' ? 0.15 : 0.55;

    const rubyPromise = streamChatCompletion({
      apiKey,
      baseUrl,
      model,
      systemPrompt: buildSystemPrompt(),
      userContent: lyrics,
      temperature: 0.1,
      signal,
      onRawChunk: (raw) => {
        latestRubyHtml = sanitizeRubyHtml(raw);
        emitMerged();
      },
    });

    const transPromise = streamChatCompletion({
      apiKey,
      baseUrl,
      model,
      systemPrompt: buildTranslationPrompt(translationStyle),
      userContent: formatNumberedLyrics(lyrics),
      temperature: transTemperature,
      signal,
      onRawChunk: (raw) => {
        latestTranslations = parseNumberedTranslations(raw);
        emitMerged();
      },
    });

    const [rawRuby, rawTrans] = await Promise.all([rubyPromise, transPromise]);
    const finalRuby = sanitizeRubyHtml(rawRuby);
    const finalTrans = parseNumberedTranslations(rawTrans);
    const finalHtml = mergeRubyWithTranslations(finalRuby, finalTrans);
    onChunk?.(finalHtml);
    return finalHtml;
  }

  Furigana.api = {
    fetchModels,
    annotateLyrics,
    buildSystemPrompt,
    buildTranslationPrompt,
    formatNumberedLyrics,
  };
})();
