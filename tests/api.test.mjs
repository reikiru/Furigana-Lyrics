import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/js/config.js';
import '../src/js/ruby.js';
import '../src/js/api.js';

const { DEFAULT_PREFS } = globalThis.Furigana.config;
const {
  buildSystemPrompt,
  buildTranslationPrompt,
  formatNumberedLyrics,
  annotateLyrics,
} = globalThis.Furigana.api;
const { parseLyricsBlocks } = globalThis.Furigana.ruby;

test('DEFAULT_PREFS defaults translationStyle to natural', () => {
  assert.equal(DEFAULT_PREFS.translationStyle, 'natural');
});

test('formatNumberedLyrics numbers non-empty lines while preserving blank lines', () => {
  const input = '今日まで生きてみました\n僕の影は伸びるばかりですが\n\n別れは必ず来るけれど';
  assert.equal(
    formatNumberedLyrics(input),
    '[1] 今日まで生きてみました\n[2] 僕の影は伸びるばかりですが\n\n[3] 別れは必ず来るけれど'
  );
});

test('buildSystemPrompt returns ruby-only prompt without translation markup', () => {
  const prompt = buildSystemPrompt({ translate: false });
  assert.match(prompt, /<ruby>/);
  assert.doesNotMatch(prompt, /<p>/);
});

test('buildTranslationPrompt returns holistic Chinese lyricist rules for natural style', () => {
  const natural = buildTranslationPrompt('natural');
  assert.match(natural, /通读整首歌词|上下文/);
  assert.match(natural, /重复|主语|翻译腔/);
  assert.match(natural, /\[编号\]/);
});

test('buildTranslationPrompt supports literal style and falls back to natural for unknown values', () => {
  const natural = buildTranslationPrompt('natural');
  const literal = buildTranslationPrompt('literal');
  const fallback = buildTranslationPrompt('invalid');
  assert.notEqual(natural, literal);
  assert.match(literal, /逐句直译/);
  assert.equal(fallback, natural);
});

test('annotateLyrics runs ruby and holistic translation requests in parallel when translate is true', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const sys = body.messages[0].content;
    const isTranslation = sys.includes('[编号]');
    const content = isTranslation
      ? '[1] 试着活到了今天\n[2] 只是影子越拉越长'
      : '<ruby>今日<rt>きょう</rt></ruby>まで<ruby>生<rt>い</rt></ruby>きてみました<br><ruby>僕<rt>ぼく</rt></ruby>の<ruby>影<rt>かげ</rt></ruby>は<ruby>伸<rt>の</rt></ruby>びるばかりですが';

    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        choices: [{ message: { content }, finish_reason: 'stop' }],
      }),
    };
  };

  try {
    const result = await annotateLyrics({
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      model: 'deepseek-chat',
      lyrics: '今日まで生きてみました\n僕の影は伸びるばかりですが',
      translate: true,
      translationStyle: 'natural',
    });

    assert.equal(calls.length, 2);
    const rubyCall = calls.find((c) => !c.body.messages[0].content.includes('[编号]'));
    const transCall = calls.find((c) => c.body.messages[0].content.includes('[编号]'));
    assert.ok(rubyCall);
    assert.ok(transCall);
    assert.equal(rubyCall.body.temperature, 0.1);
    assert.ok(transCall.body.temperature >= 0.5);
    assert.match(transCall.body.messages[1].content, /^\[1\] 今日まで生きてみました/);

    const blocks = parseLyricsBlocks(result);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].translation, '试着活到了今天');
    assert.equal(blocks[1].translation, '只是影子越拉越长');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('annotateLyrics only sends one ruby request when translate is false', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        choices: [{ message: { content: '<ruby>夢<rt>ゆめ</rt></ruby>' }, finish_reason: 'stop' }],
      }),
    };
  };

  try {
    const result = await annotateLyrics({
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      model: 'deepseek-chat',
      lyrics: '夢',
      translate: false,
    });
    assert.equal(callCount, 1);
    assert.equal(result, '<ruby>夢<rt>ゆめ</rt></ruby>');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
