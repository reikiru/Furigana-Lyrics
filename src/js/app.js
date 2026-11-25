(() => {
  const {
    DEFAULT_PREFS,
    SAMPLE_LYRICS,
    loadApiConfig,
    loadPrefs,
    saveApiConfig,
    savePrefs,
  } = globalThis.Furigana.config;
  const { fetchModels, annotateLyrics } = globalThis.Furigana.api;
  const { renderLyricsHtml, rubyHtmlToBracketText } = globalThis.Furigana.ruby;
  const { exportRubyPng } = globalThis.Furigana.exporter;

  const $ = (id) => document.getElementById(id);
  const CUSTOM_MODEL_VALUE = '__custom__';

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
    cfgBaseUrl: $('cfg-base-url'),
    cfgApiKey: $('cfg-api-key'),
    btnFetchModels: $('btn-fetch-models'),
    cfgModelSelect: $('cfg-model-select'),
    cfgModelCustom: $('cfg-model-custom'),
    modelFetchStatus: $('model-fetch-status'),

    workspace: $('workspace'),
    btnCollapseInput: $('btn-collapse-input'),
    btnExpandInput: $('btn-expand-input'),

    lyricsInput: $('lyrics-input'),
    charCount: $('char-count'),
    btnSample: $('btn-sample'),
    btnClear: $('btn-clear'),
    optEnableTranslation: $('opt-enable-translation'),
    btnAnnotate: $('btn-annotate'),
    btnCancel: $('btn-cancel'),
    statusText: $('status-text'),

    optShowRuby: $('opt-show-ruby'),
    optShowTranslation: $('opt-show-translation'),
    btnCopyText: $('btn-copy-text'),
    btnCopyHtml: $('btn-copy-html'),
    btnExportPng: $('btn-export-png'),
    outputView: $('output-view'),
    toast: $('toast'),
  };

  let apiConfig = loadApiConfig();
  let prefs = loadPrefs();
  let modalModels = [...apiConfig.models];
  let currentHtml = '';
  let activeController = null;
  let modelFetchController = null;
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

  function setModelFetchStatus(msg, state = '') {
    els.modelFetchStatus.textContent = msg;
    els.modelFetchStatus.className = 'field-hint' + (state ? ` is-${state}` : '');
  }

  function updateApiIndicator() {
    els.apiDot.classList.toggle('is-ready', Boolean(apiConfig.apiKey && apiConfig.model));
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
    els.outputView.innerHTML = renderLyricsHtml(html, { showTranslation: true });
    setOutputActionsEnabled(Boolean(html.trim()));
  }

  function renderModelOptions(models, selectedModel) {
    const select = els.cfgModelSelect;
    select.innerHTML = '';

    if (models.length === 0) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '请先填写 API Key 并拉取模型';
      select.appendChild(placeholder);
    } else {
      for (const id of models) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
      }
    }

    const customOpt = document.createElement('option');
    customOpt.value = CUSTOM_MODEL_VALUE;
    customOpt.textContent = '手动输入模型 ID…';
    select.appendChild(customOpt);

    if (selectedModel && models.includes(selectedModel)) {
      select.value = selectedModel;
      els.cfgModelCustom.hidden = true;
      els.cfgModelCustom.value = '';
    } else if (selectedModel) {
      select.value = CUSTOM_MODEL_VALUE;
      els.cfgModelCustom.hidden = false;
      els.cfgModelCustom.value = selectedModel;
    } else if (models.length > 0) {
      select.value = models[0];
      els.cfgModelCustom.hidden = true;
      els.cfgModelCustom.value = '';
    } else {
      select.value = '';
      els.cfgModelCustom.hidden = true;
      els.cfgModelCustom.value = '';
    }
  }

  async function handleFetchModels({ silentIfEmpty = false } = {}) {
    const apiKey = els.cfgApiKey.value.trim();
    const baseUrl = els.cfgBaseUrl.value.trim() || apiConfig.baseUrl;

    if (!apiKey) {
      if (!silentIfEmpty) setModelFetchStatus('请先填写 API Key 再拉取可用模型', 'error');
      return;
    }

    modelFetchController?.abort();
    modelFetchController = new AbortController();

    els.btnFetchModels.disabled = true;
    els.btnFetchModels.textContent = '拉取中…';
    setModelFetchStatus('正在从官方接口拉取可用模型…');

    const prevSelection =
      els.cfgModelSelect.value === CUSTOM_MODEL_VALUE
        ? els.cfgModelCustom.value.trim()
        : els.cfgModelSelect.value || apiConfig.model;

    try {
      const models = await fetchModels({
        apiKey,
        baseUrl,
        signal: modelFetchController.signal,
      });
      modalModels = models;
      const nextSelected = models.includes(prevSelection) ? prevSelection : models[0];
      renderModelOptions(models, nextSelected);
      setModelFetchStatus(`已拉取 ${models.length} 个可用模型`, 'ok');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setModelFetchStatus(err.message || '拉取模型失败，请检查 Key 或网络', 'error');
    } finally {
      modelFetchController = null;
      els.btnFetchModels.disabled = false;
      els.btnFetchModels.textContent = '拉取可用模型';
    }
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

    els.optEnableTranslation.checked = Boolean(prefs.enableTranslation);
    els.optShowRuby.checked = Boolean(prefs.showRuby);
    els.outputView.classList.toggle('hide-ruby', !prefs.showRuby);
    els.optShowTranslation.checked = Boolean(prefs.showTranslation);
    els.outputView.classList.toggle('hide-translation', !prefs.showTranslation);

    const collapsed = Boolean(prefs.inputCollapsed);
    els.workspace.classList.toggle('is-input-collapsed', collapsed);
    els.btnExpandInput.hidden = !collapsed;
  }

  function openApiModal() {
    els.cfgBaseUrl.value = apiConfig.baseUrl;
    els.cfgApiKey.value = apiConfig.apiKey;
    modalModels = [...apiConfig.models];
    renderModelOptions(modalModels, apiConfig.model);

    if (modalModels.length > 0) {
      setModelFetchStatus(`当前缓存 ${modalModels.length} 个模型，可点击「拉取可用模型」刷新`);
    } else {
      setModelFetchStatus('填写 API Key 后点击「拉取可用模型」，自动从官方接口同步最新模型列表。');
    }

    els.apiModal.showModal();
    if (apiConfig.apiKey && modalModels.length === 0) {
      handleFetchModels({ silentIfEmpty: true });
    } else if (!apiConfig.apiKey) {
      els.cfgApiKey.focus();
    }
  }

  async function handleAnnotate() {
    const lyrics = els.lyricsInput.value.trim();
    if (!lyrics) {
      setStatus('请先输入或粘贴日语歌词', 'error');
      els.lyricsInput.focus();
      return;
    }

    if (!apiConfig.apiKey || !apiConfig.model) {
      setStatus(!apiConfig.apiKey ? '请先配置 API Key' : '请先拉取并选择可用模型', 'error');
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
        translate: Boolean(prefs.enableTranslation),
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
    els.btnCloseModal.addEventListener('click', () => {
      modelFetchController?.abort();
      els.apiModal.close();
    });
    els.btnCancelModal.addEventListener('click', () => {
      modelFetchController?.abort();
      els.apiModal.close();
    });

    els.btnFetchModels.addEventListener('click', () => handleFetchModels());
    els.cfgApiKey.addEventListener('change', () => {
      if (els.cfgApiKey.value.trim()) {
        handleFetchModels({ silentIfEmpty: true });
      }
    });

    els.cfgModelSelect.addEventListener('change', () => {
      const isCustom = els.cfgModelSelect.value === CUSTOM_MODEL_VALUE;
      els.cfgModelCustom.hidden = !isCustom;
      if (isCustom) els.cfgModelCustom.focus();
    });

    els.apiForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const apiKey = els.cfgApiKey.value.trim();
      const model =
        els.cfgModelSelect.value === CUSTOM_MODEL_VALUE
          ? els.cfgModelCustom.value.trim()
          : els.cfgModelSelect.value.trim();

      if (!apiKey) {
        setModelFetchStatus('请先填写 API Key', 'error');
        els.cfgApiKey.focus();
        return;
      }
      if (!model) {
        setModelFetchStatus('请先拉取并选择可用模型，或切换到「手动输入模型 ID」', 'error');
        return;
      }

      apiConfig = saveApiConfig({
        apiKey,
        model,
        baseUrl: els.cfgBaseUrl.value,
        models: modalModels,
      });
      updateApiIndicator();
      els.apiModal.close();
      showToast(`已保存设置（${apiConfig.model}）`);
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

    function setInputCollapsed(collapsed) {
      prefs = savePrefs({ ...prefs, inputCollapsed: collapsed });
      applyPrefs();
      if (!collapsed) els.lyricsInput.focus();
    }

    els.btnCollapseInput.addEventListener('click', () => setInputCollapsed(true));
    els.btnExpandInput.addEventListener('click', () => setInputCollapsed(false));
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setInputCollapsed(!prefs.inputCollapsed);
      }
    });

    els.btnAnnotate.addEventListener('click', handleAnnotate);
    els.btnCancel.addEventListener('click', () => activeController?.abort());

    els.optEnableTranslation.addEventListener('change', () => {
      prefs = savePrefs({ ...prefs, enableTranslation: els.optEnableTranslation.checked });
      applyPrefs();
    });

    els.optShowRuby.addEventListener('change', () => {
      prefs = savePrefs({ ...prefs, showRuby: els.optShowRuby.checked });
      applyPrefs();
    });

    els.optShowTranslation.addEventListener('change', () => {
      prefs = savePrefs({ ...prefs, showTranslation: els.optShowTranslation.checked });
      applyPrefs();
    });

    els.btnCopyText.addEventListener('click', async () => {
      if (!currentHtml) return;
      const text = rubyHtmlToBracketText(currentHtml, {
        showTranslation: Boolean(prefs.showTranslation),
      });
      await navigator.clipboard.writeText(text);
      showToast('已复制注音文本');
    });

    els.btnCopyHtml.addEventListener('click', async () => {
      if (!currentHtml) return;
      const html = renderLyricsHtml(currentHtml, {
        showTranslation: Boolean(prefs.showTranslation),
      });
      await navigator.clipboard.writeText(html);
      showToast('已复制 Ruby HTML');
    });

    els.btnExportPng.addEventListener('click', () => {
      try {
        exportRubyPng(els.outputView, {
          rawHtml: currentHtml,
          showRuby: Boolean(prefs.showRuby),
          showTranslation: Boolean(prefs.showTranslation),
        });
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
