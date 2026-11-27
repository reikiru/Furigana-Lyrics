(() => {
  const Furigana = (globalThis.Furigana = globalThis.Furigana || {});
  const ALLOWED_TAGS = new Set(['ruby', 'rt', 'br', 'p']);

  function escapeHtml(text) {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function decodeEntities(str) {
    return str
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&amp;', '&');
  }

  /**
   * Strip optional markdown code fences returned by LLMs.
   */
  function stripCodeFence(raw) {
    return raw
      .trim()
      .replace(/^```(?:html)?\s*\n?/i, '')
      .replace(/\n?```\s*$/, '');
  }

  /**
   * Sanitize LLM HTML output: only allow bare <ruby>, <rt>, <br>, and <p> tags.
   * All other tags and attributes are escaped.
   */
  function sanitizeRubyHtml(raw) {
    const cleaned = stripCodeFence(raw);
    return cleaned.replace(/<(\/?)([a-zA-Z0-9]+)[^>]*>/g, (match, slash, tag) => {
      const lower = tag.toLowerCase();
      if (ALLOWED_TAGS.has(lower)) {
        if (lower === 'br') return '<br>';
        return `<${slash}${lower}>`;
      }
      return escapeHtml(match);
    });
  }

  /**
   * Parse a single line of ruby HTML into segments:
   *   { type: 'text', text: string } | { type: 'ruby', base: string, rt: string }
   */
  function parseRubySegments(line) {
    const segments = [];
    const tokenRe = /<ruby>([\s\S]*?)<\/ruby>/gi;
    let lastIndex = 0;
    let match;

    while ((match = tokenRe.exec(line)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', text: decodeEntities(line.slice(lastIndex, match.index)) });
      }
      const inner = match[1];
      const rtParts = [];
      const base = inner.replace(/<rt>([\s\S]*?)<\/rt>/gi, (_, rtText) => {
        rtParts.push(decodeEntities(rtText));
        return '';
      });
      const cleanBase = decodeEntities(base.replace(/<[^>]+>/g, ''));
      const cleanRt = rtParts.join('');
      if (cleanBase) {
        segments.push({ type: 'ruby', base: cleanBase, rt: cleanRt });
      }
      lastIndex = tokenRe.lastIndex;
    }

    if (lastIndex < line.length) {
      segments.push({ type: 'text', text: decodeEntities(line.slice(lastIndex)) });
    }
    return segments;
  }

  /**
   * Parse sanitized ruby HTML into an array of lines (legacy ruby-only helper).
   */
  function parseRubyLines(html) {
    const normalized = html.replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
    const rawLines = normalized.split('\n');
    const lines = rawLines.map(parseRubySegments);

    while (lines.length > 1 && lines[lines.length - 1].length === 0) {
      lines.pop();
    }
    return lines;
  }

  /**
   * Parse sanitized ruby + translation HTML into structured blocks:
   *   { type: 'lyric', segments: Array, translation: string } | { type: 'blank' }
   * Supports both closed <p>...</p> and partial unclosed streaming <p>... tags.
   */
  function parseLyricsBlocks(html) {
    const normalized = html.replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
    const blocks = [];
    const pRe = /<p>([\s\S]*?)(?:<\/p>|$)/gi;
    let lastIndex = 0;
    let afterP = false;
    let match;

    function pushTextChunk(chunk, hasFollowingP) {
      if (!chunk) return;
      let lines = chunk.split('\n');

      // A single newline immediately after </p> separates the previous entry from the next line.
      if (afterP && lines.length > 1 && lines[0].trim() === '') {
        lines.shift();
      }
      // A single newline immediately before <p> separates the lyric line from its own translation.
      if (hasFollowingP && lines.length > 1 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }

      for (const rawLine of lines) {
        if (rawLine.trim() === '') {
          blocks.push({ type: 'blank' });
        } else {
          blocks.push({
            type: 'lyric',
            segments: parseRubySegments(rawLine),
            translation: '',
          });
        }
      }
    }

    while ((match = pRe.exec(normalized)) !== null) {
      const before = normalized.slice(lastIndex, match.index);
      pushTextChunk(before, true);

      const transText = decodeEntities(match[1].replace(/<[^>]+>/g, '')).trim();
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'lyric' && !prev.translation) {
        prev.translation = transText;
      } else if (transText) {
        blocks.push({ type: 'lyric', segments: [], translation: transText });
      }

      lastIndex = pRe.lastIndex;
      afterP = true;
    }

    if (lastIndex < normalized.length) {
      pushTextChunk(normalized.slice(lastIndex), false);
    }

    while (blocks.length > 0 && blocks[blocks.length - 1].type === 'blank') {
      blocks.pop();
    }
    return blocks;
  }

  /**
   * Render structured HTML for DOM display or HTML clipboard export.
   */
  function renderLyricsHtml(html, { showTranslation = true } = {}) {
    const blocks = parseLyricsBlocks(html);
    return blocks
      .map((block) => {
        if (block.type === 'blank') {
          return '<div class="lyric-blank" aria-hidden="true"></div>';
        }
        const jpHtml = block.segments
          .map((seg) =>
            seg.type === 'ruby'
              ? `<ruby>${escapeHtml(seg.base)}<rt>${escapeHtml(seg.rt)}</rt></ruby>`
              : escapeHtml(seg.text)
          )
          .join('');
        const transHtml =
          showTranslation && block.translation
            ? `<div class="lyric-trans">${escapeHtml(block.translation)}</div>`
            : '';
        return `<div class="lyric-entry"><div class="lyric-jp">${jpHtml}</div>${transHtml}</div>`;
      })
      .join('');
  }

  /**
   * Convert ruby HTML to plain text with parenthesized readings, e.g. 夢(ゆめ).
   * Includes Chinese translation lines when `showTranslation` is true.
   */
  function rubyHtmlToBracketText(html, { showTranslation = true } = {}) {
    return parseLyricsBlocks(html)
      .map((block) => {
        if (block.type === 'blank') return '';
        const jp = block.segments
          .map((seg) =>
            seg.type === 'ruby' && seg.rt
              ? `${seg.base}(${seg.rt})`
              : seg.type === 'ruby'
                ? seg.base
                : seg.text
          )
          .join('');
        if (showTranslation && block.translation) {
          return jp ? `${jp}\n${block.translation}` : block.translation;
        }
        return jp;
      })
      .join('\n');
  }

  /**
   * Parse line-numbered translation output (e.g. `[1] 译文` or `1. 译文`) into a 1-based map.
   */
  function parseNumberedTranslations(raw) {
    const cleaned = stripCodeFence(raw || '');
    const map = {};
    for (const line of cleaned.replace(/\r\n/g, '\n').split('\n')) {
      const match = line.match(/^\s*\[?(\d+)\]?[\s.:：\-—、)]+(.+)$/);
      if (!match) continue;
      const idx = Number(match[1]);
      const text = match[2].trim();
      if (idx > 0 && text) {
        map[idx] = text;
      }
    }
    return map;
  }

  /**
   * Merge sanitized ruby-only HTML with a 1-based map of translated lines,
   * preserving stanza blanks and outputting canonical `<p>` translation lines.
   */
  function mergeRubyWithTranslations(rubyHtml, translations = {}) {
    const blocks = parseLyricsBlocks(rubyHtml);
    let lineIndex = 0;
    const out = [];

    for (const block of blocks) {
      if (block.type === 'blank') {
        out.push('');
        continue;
      }
      lineIndex += 1;
      const jpHtml = block.segments
        .map((seg) =>
          seg.type === 'ruby'
            ? `<ruby>${escapeHtml(seg.base)}<rt>${escapeHtml(seg.rt)}</rt></ruby>`
            : escapeHtml(seg.text)
        )
        .join('');
      const trans = translations[lineIndex] || block.translation || '';
      if (trans) {
        out.push(`${jpHtml}\n<p>${escapeHtml(trans)}</p>`);
      } else {
        out.push(jpHtml);
      }
    }

    return out.join('\n');
  }

  Furigana.ruby = {
    stripCodeFence,
    sanitizeRubyHtml,
    parseRubyLines,
    parseLyricsBlocks,
    renderLyricsHtml,
    rubyHtmlToBracketText,
    parseNumberedTranslations,
    mergeRubyWithTranslations,
  };
})();
