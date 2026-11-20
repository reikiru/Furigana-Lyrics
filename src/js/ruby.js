(() => {
  const Furigana = (globalThis.Furigana = globalThis.Furigana || {});
  const ALLOWED_TAGS = new Set(['ruby', 'rt', 'br']);

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
   * Sanitize LLM HTML output: only allow bare <ruby>, <rt>, and <br> tags.
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
   * Parse sanitized ruby HTML into an array of lines.
   * Each line is an array of segments:
   *   { type: 'text', text: string } | { type: 'ruby', base: string, rt: string }
   */
  function parseRubyLines(html) {
    const normalized = html.replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
    const rawLines = normalized.split('\n');

    const lines = rawLines.map((line) => {
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
    });

    while (lines.length > 1 && lines[lines.length - 1].length === 0) {
      lines.pop();
    }
    return lines;
  }

  /**
   * Convert ruby HTML to plain text with parenthesized readings, e.g. 夢(ゆめ).
   */
  function rubyHtmlToBracketText(html) {
    return parseRubyLines(html)
      .map((line) =>
        line
          .map((seg) =>
            seg.type === 'ruby' && seg.rt
              ? `${seg.base}(${seg.rt})`
              : seg.type === 'ruby'
                ? seg.base
                : seg.text
          )
          .join('')
      )
      .join('\n');
  }

  Furigana.ruby = {
    stripCodeFence,
    sanitizeRubyHtml,
    parseRubyLines,
    rubyHtmlToBracketText,
  };
})();
