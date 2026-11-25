(() => {
  const Furigana = (globalThis.Furigana = globalThis.Furigana || {});

  /**
   * Render annotated ruby + optional translation HTML to a crisp Retina PNG and trigger download.
   */
  function exportRubyPng(outputEl, options = {}) {
    const { parseLyricsBlocks } = Furigana.ruby;
    const sourceHtml = typeof options.rawHtml === 'string' ? options.rawHtml : outputEl.innerHTML;
    const blocks = parseLyricsBlocks(sourceHtml);
    const hasContent = blocks.some(
      (b) => b.type === 'lyric' && (b.segments.length > 0 || b.translation)
    );
    if (!hasContent) {
      throw new Error('没有可导出的标注内容');
    }

    const cs = getComputedStyle(outputEl);
    const rootCs = getComputedStyle(document.documentElement);

    const baseSize = parseFloat(cs.fontSize) || 20;
    const lineHeightPx = parseFloat(cs.lineHeight) || baseSize * 2.6;
    const rubySize = Math.round(baseSize * 0.54);
    const rubyGap = Math.max(3, Math.round(baseSize * 0.16));
    const transSize = Math.max(12, Math.round(baseSize * 0.72));
    const transLineStep = Math.round(transSize * 1.55);
    const transTopGap = Math.max(6, Math.round(baseSize * 0.38));
    const entryBottomGap = Math.max(10, Math.round(baseSize * 0.55));

    const showRuby = options.showRuby ?? !outputEl.classList.contains('hide-ruby');
    const showTranslation =
      options.showTranslation ?? !outputEl.classList.contains('hide-translation');

    const bgColor = options.bgColor || rootCs.getPropertyValue('--bg-surface').trim() || '#fffdf8';
    const textColor = rootCs.getPropertyValue('--text-primary').trim() || '#2f2419';
    const rubyColor = rootCs.getPropertyValue('--ruby-color').trim() || '#b45d19';
    const transColor = rootCs.getPropertyValue('--text-secondary').trim() || '#756453';

    const baseFont = `400 ${baseSize}px "Hiragino Mincho ProN", "YuMincho", "Noto Serif JP", serif`;
    const rubyFont = `400 ${rubySize}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif`;
    const transFont = `400 ${transSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans", sans-serif`;

    const paddingX = 52;
    const paddingY = 48;
    const maxContentWidth = Math.min(760, Math.max(460, outputEl.clientWidth || 640));

    const measureCtx = document.createElement('canvas').getContext('2d');

    function wrapPlainText(text, font) {
      measureCtx.font = font;
      const lines = [];
      let current = '';
      let currentW = 0;
      for (const ch of text) {
        const w = measureCtx.measureText(ch).width;
        if (current && currentW + w > maxContentWidth) {
          lines.push(current);
          current = ch;
          currentW = w;
        } else {
          current += ch;
          currentW += w;
        }
      }
      if (current) lines.push(current);
      return lines;
    }

    const renderRows = [];
    for (const block of blocks) {
      if (block.type === 'blank') {
        renderRows.push({ type: 'blank' });
        continue;
      }

      const units = [];
      for (const seg of block.segments) {
        if (seg.type === 'ruby') {
          measureCtx.font = baseFont;
          const baseW = measureCtx.measureText(seg.base).width;
          measureCtx.font = rubyFont;
          const rubyW = showRuby && seg.rt ? measureCtx.measureText(seg.rt).width : 0;
          const cellW = Math.max(baseW, rubyW);
          units.push({
            type: 'ruby',
            base: seg.base,
            rt: showRuby ? seg.rt : '',
            baseW,
            rubyW,
            cellW,
          });
        } else {
          measureCtx.font = baseFont;
          for (const ch of seg.text) {
            const w = measureCtx.measureText(ch).width;
            units.push({ type: 'text', text: ch, cellW: w });
          }
        }
      }

      const jpWrapped = [];
      let current = [];
      let currentW = 0;
      for (const unit of units) {
        if (current.length > 0 && currentW + unit.cellW > maxContentWidth) {
          jpWrapped.push(current);
          current = [];
          currentW = 0;
        }
        current.push(unit);
        currentW += unit.cellW;
      }
      if (current.length > 0) jpWrapped.push(current);

      const transLines =
        showTranslation && block.translation ? wrapPlainText(block.translation, transFont) : [];

      for (let i = 0; i < jpWrapped.length; i++) {
        renderRows.push({
          type: 'jp',
          units: jpWrapped[i],
          hasFollowingTrans: i === jpWrapped.length - 1 && transLines.length > 0,
        });
      }

      for (let i = 0; i < transLines.length; i++) {
        renderRows.push({
          type: 'trans',
          text: transLines[i],
          isLastTrans: i === transLines.length - 1,
        });
      }
    }

    const rowStep = Math.max(lineHeightPx, baseSize + rubySize + rubyGap + 14);
    const blankRowStep = Math.round(rowStep * 0.55);

    let contentHeight = 0;
    for (const row of renderRows) {
      if (row.type === 'blank') {
        contentHeight += blankRowStep;
      } else if (row.type === 'jp') {
        contentHeight += row.hasFollowingTrans ? transTopGap + transSize : rowStep;
      } else {
        contentHeight += row.isLastTrans ? rowStep : transLineStep;
      }
    }

    const logicalWidth = maxContentWidth + paddingX * 2;
    const logicalHeight = paddingY * 2 + contentHeight + rubySize;
    const dpr = Math.max(2, Math.ceil(window.devicePixelRatio || 2));

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(logicalWidth * dpr);
    canvas.height = Math.ceil(logicalHeight * dpr);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    let cursorY = paddingY + rubySize + rubyGap + baseSize;
    for (const row of renderRows) {
      if (row.type === 'blank') {
        cursorY += blankRowStep;
        continue;
      }
      if (row.type === 'jp') {
        let cursorX = paddingX;
        for (const unit of row.units) {
          if (unit.type === 'text') {
            ctx.font = baseFont;
            ctx.fillStyle = textColor;
            ctx.fillText(unit.text, cursorX, cursorY);
          } else {
            const baseX = cursorX + (unit.cellW - unit.baseW) / 2;
            ctx.font = baseFont;
            ctx.fillStyle = textColor;
            ctx.fillText(unit.base, baseX, cursorY);

            if (unit.rt) {
              const rubyX = cursorX + (unit.cellW - unit.rubyW) / 2;
              ctx.font = rubyFont;
              ctx.fillStyle = rubyColor;
              ctx.fillText(unit.rt, rubyX, cursorY - baseSize - rubyGap);
            }
          }
          cursorX += unit.cellW;
        }
        cursorY += row.hasFollowingTrans ? transTopGap + transSize : rowStep;
      } else {
        ctx.font = transFont;
        ctx.fillStyle = transColor;
        ctx.fillText(row.text, paddingX, cursorY);
        cursorY += row.isLastTrans ? rowStep : transLineStep;
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `furigana_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  Furigana.exporter = { exportRubyPng };
})();
