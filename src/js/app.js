(() => {
  const {
    DEFAULT_PREFS,
    SAMPLE_LYRICS,
    loadApiConfig,
    loadPrefs,
    saveApiConfig,
    savePrefs,
  } = globalThis.Furigana.config;
  const { annotateLyrics } = globalThis.Furigana.api;
  const { rubyHtmlToBracketText } = globalThis.Furigana.ruby;
  const { exportRubyPng } = globalThis.Furigana.exporter;

  const $ = (id) => document.getElementById(id);

  const els = {
    themeBtns: document.querySelectorAll('[data-theme-pick]'),
    btnTypography: $('btn-typography'),
    typographyBar: $('typography-bar'),
    optFontSize: $('opt-font-size'),
    valFontSize: $('val-font-size'),
    optLineHeight: $('opt-line-height'),
    valLineHeight: $('val-line-height'),
    optMaxWidth: $('opt-max-width'),
    valMaxWidth: $('val-max-width'),
    optBgColor: $('opt-bg-color'),
    btnResetTypo: $('btn-reset-typo'),

    btnApiSettings: $('btn-api-settings'),
    apiDot: $('api-dot'),
    apiModal: $('api-modal'),
    apiForm: $('api-form'),
    btnCloseModal: $('btn-close-modal'),
    btnCancelModal: $('btn-cancel-modal'),
    cfgApiKey: $('cfg-api-key'),
    cfgModelPreset: $('cfg-model-preset'),
    cfgModelCustom: $('cfg-model-custom'),
    cfgBaseUrl: $('cfg-base-url'),

    lyricsInput: $('lyrics-input'),
    charCount: $('char-count'),
    btnSample: $('btn-sample'),
    btnClear: $('btn-clear'),
    btnAnnotate: $('btn-annotate'),
    btnCancel: $('btn-cancel'),
    statusText: $('status-text'),

    optShowRuby: $('opt-show-ruby'),
    btnCopyText: $('btn-copy-text'),
    btnCopyHtml: $('btn-copy-html'),
    btnExportPng: $('btn-export-png'),
    outputView: $('output-view'),
    toast: $('toast'),
  };

  const PRESET_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner']);

  let apiConfig = loadApiConfig();
  let prefs = loadPrefs();
  let currentHtml = '';
  let activeController = null;
  let toastTimer = null;

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2200);
  }

  function setStatus(msg, state = '') {
    els.statusText.textContent = msg;
    els.statusText.className = 'foot-status' + (state ? ` is-${state}` : '');
  }

  function updateApiIndicator() {
    els.apiDot.classList.toggle('is-ready', Boolean(apiConfig.apiKey));
  }

  function updateCharCount() {
    const text = els.lyricsInput.value;
    const count = text.replace(/\s/g, '').length;
    els.charCount.textContent = `${count} 字`;
  }

  function setOutputActionsEnabled(enabled) {
    els.btnCopyText.disabled = !enabled;
    els.btnCopyHtml.disabled = !enabled;
    els.btnExportPng.disabled = !enabled;
  }

  function renderEmptyOutput() {
    currentHtml = '';
    els.outputView.classList.add('is-empty');
    els.outputView.innerHTML = `
      <div class="empty-hint">
        <p class="empty-jp"><ruby>振<rt>ふ</rt></ruby>り<ruby>仮名<rt>がな</rt></ruby></p>
        <p class="empty-desc">在左侧输入日语歌词，点击「标注假名」即可生成</p>
      </div>`;
    setOutputActionsEnabled(false);
  }

  function renderRubyOutput(html) {
    currentHtml = html;
    els.outputView.classList.remove('is-empty');
    els.outputView.innerHTML = html;
    setOutputActionsEnabled(Boolean(html.trim()));
  }

  function applyPrefs() {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.style.setProperty('--lyrics-font-size', `${prefs.fontSize}px`);
    document.documentElement.style.setProperty('--lyrics-line-height', String(prefs.lineHeight));
    document.documentElement.style.setProperty('--workspace-max-width', `${prefs.maxWidth}px`);
    document.body.style.background = prefs.customBg || '';

    els.themeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themePick === prefs.theme);
    });

    els.optFontSize.value = String(prefs.fontSize);
    els.valFontSize.textContent = `${prefs.fontSize}px`;

    els.optLineHeight.value = String(Math.round(prefs.lineHeight * 10));
    els.valLineHeight.textContent = prefs.lineHeight.toFixed(1);

    els.optMaxWidth.value = String(prefs.maxWidth);
    els.valMaxWidth.textContent = `${prefs.maxWidth}px`;

    const computedBg =
      prefs.customBg ||
      getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(computedBg)) {
      els.optBgColor.value = computedBg;
    }

    els.optShowRuby.checked = prefs.showRuby;
    els.outputView.classList.toggle('hide-ruby', !prefs.showRuby);
  }

  function openApiModal() {
    els.cfgApiKey.value = apiConfig.apiKey;
    els.cfgBaseUrl.value = apiConfig.baseUrl;

    if (PRESET_MODELS.has(apiConfig.model)) {
      els.cfgModelPreset.value = apiConfig.model;
      els.cfgModelCustom.hidden = true;
      els.cfgModelCustom.value = '';
    } else {
      els.cfgModelPreset.value = 'custom';
      els.cfgModelCustom.hidden = false;
      els.cfgModelCustom.value = apiConfig.model;
    }

    els.apiModal.showModal();
    els.cfgApiKey.focus();
  }

  async function handleAnnotate() {
    const lyrics = els.lyricsInput.value.trim();
    if (!lyrics) {
      setStatus('请先输入或粘贴日语歌词', 'error');
      els.lyricsInput.focus();
      return;
    }

    if (!apiConfig.apiKey) {
      setStatus('请先配置 API Key', 'error');
      openApiModal();
      return;
    }

    activeController = new AbortController();
    els.btnAnnotate.disabled = true;
    els.btnCancel.hidden = false;
    setStatus(`正在使用 ${apiConfig.model} 标注中…`);

    try {
      const finalHtml = await annotateLyrics({
        apiKey: apiConfig.apiKey,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        lyrics,
        signal: activeController.signal,
        onChunk: (partialHtml) => {
          if (partialHtml.trim()) {
            renderRubyOutput(partialHtml);
          }
        },
      });
      renderRubyOutput(finalHtml);
      setStatus('标注完成', 'ok');
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('已停止生成');
      } else {
        setStatus(err.message || '标注失败，请检查网络与 API 设置', 'error');
      }
    } finally {
      activeController = null;
      els.btnAnnotate.disabled = false;
      els.btnCancel.hidden = true;
    }
  }

  function bindEvents() {
    els.themeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        prefs = savePrefs({ ...prefs, theme: btn.dataset.themePick, customBg: '' });
        applyPrefs();
      });
    });

    els.btnTypography.addEventListener('click', () => {
      const isHidden = els.typographyBar.hidden;
      els.typographyBar.hidden = !isHidden;
      els.btnTypography.setAttribute('aria-expanded', String(isHidden));
    });

    els.optFontSize.addEventListener('input', () => {
      prefs = savePrefs({ ...prefs, fontSize: Number(els.optFontSize.value) });
      applyPrefs();
    });

    els.optLineHeight.addEventListener('input', () => {
      prefs = savePrefs({ ...prefs, lineHeight: Number(els.optLineHeight.value) / 10 });
      applyPrefs();
    });

    els.optMaxWidth.addEventListener('input', () => {
      prefs = savePrefs({ ...prefs, maxWidth: Number(els.optMaxWidth.value) });
      applyPrefs();
    });

    els.optBgColor.addEventListener('input', () => {
      prefs = savePrefs({ ...prefs, customBg: els.optBgColor.value });
      applyPrefs();
    });

    els.btnResetTypo.addEventListener('click', () => {
      prefs = savePrefs({ ...DEFAULT_PREFS, theme: prefs.theme });
      applyPrefs();
      showToast('已重置排版设置');
    });

    els.btnApiSettings.addEventListener('click', openApiModal);
    els.btnCloseModal.addEventListener('click', () => els.apiModal.close());
    els.btnCancelModal.addEventListener('click', () => els.apiModal.close());

    els.cfgModelPreset.addEventListener('change', () => {
      const isCustom = els.cfgModelPreset.value === 'custom';
      els.cfgModelCustom.hidden = !isCustom;
      if (isCustom) els.cfgModelCustom.focus();
    });

    els.apiForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const model =
        els.cfgModelPreset.value === 'custom'
          ? els.cfgModelCustom.value.trim() || 'deepseek-chat'
          : els.cfgModelPreset.value;

      apiConfig = saveApiConfig({
        apiKey: els.cfgApiKey.value,
        model,
        baseUrl: els.cfgBaseUrl.value,
      });
      updateApiIndicator();
      els.apiModal.close();
      showToast('API 设置已保存');
    });

    els.lyricsInput.addEventListener('input', updateCharCount);
    els.lyricsInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!activeController) handleAnnotate();
      }
    });

    els.btnSample.addEventListener('click', () => {
      els.lyricsInput.value = SAMPLE_LYRICS;
      updateCharCount();
      els.lyricsInput.focus();
    });

    els.btnClear.addEventListener('click', () => {
      els.lyricsInput.value = '';
      updateCharCount();
      renderEmptyOutput();
      setStatus('就绪');
      els.lyricsInput.focus();
    });

    els.btnAnnotate.addEventListener('click', handleAnnotate);
    els.btnCancel.addEventListener('click', () => activeController?.abort());

    els.optShowRuby.addEventListener('change', () => {
      prefs = savePrefs({ ...prefs, showRuby: els.optShowRuby.checked });
      applyPrefs();
    });

    els.btnCopyText.addEventListener('click', async () => {
      if (!currentHtml) return;
      await navigator.clipboard.writeText(rubyHtmlToBracketText(currentHtml));
      showToast('已复制括号注音文本');
    });

    els.btnCopyHtml.addEventListener('click', async () => {
      if (!currentHtml) return;
      await navigator.clipboard.writeText(currentHtml);
      showToast('已复制 Ruby HTML');
    });

    els.btnExportPng.addEventListener('click', () => {
      try {
        exportRubyPng(els.outputView, { showRuby: prefs.showRuby });
        showToast('正在导出高清 PNG…');
      } catch (err) {
        setStatus(err.message, 'error');
      }
    });
  }

  applyPrefs();
  updateApiIndicator();
  els.lyricsInput.value = SAMPLE_LYRICS;
  updateCharCount();
  bindEvents();
})();
