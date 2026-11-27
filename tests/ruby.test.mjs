import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/js/ruby.js';

const {
  stripCodeFence,
  sanitizeRubyHtml,
  parseRubyLines,
  parseLyricsBlocks,
  renderLyricsHtml,
  rubyHtmlToBracketText,
  parseNumberedTranslations,
  mergeRubyWithTranslations,
} = globalThis.Furigana.ruby;

test('stripCodeFence removes markdown html fences', () => {
  assert.equal(stripCodeFence('```html\n<ruby>夢<rt>ゆめ</rt></ruby>\n```'), '<ruby>夢<rt>ゆめ</rt></ruby>');
  assert.equal(stripCodeFence('```\nテスト\n```'), 'テスト');
});

test('sanitizeRubyHtml keeps ruby/rt/br/p and escapes unsafe tags & attributes', () => {
  const input = '<ruby class="x">夜空<rt onclick="alert(1)">よぞら</rt></ruby><br/><p class="tr" onclick="x()">夜空</p><script>bad()</script>';
  const output = sanitizeRubyHtml(input);
  assert.equal(output, '<ruby>夜空<rt>よぞら</rt></ruby><br><p>夜空</p>&lt;script&gt;bad()&lt;/script&gt;');
});

test('parseRubyLines splits lines and ruby segments accurately', () => {
  const html = '<ruby>夢<rt>ゆめ</rt></ruby>を<ruby>見<rt>み</rt></ruby>たんだ<br><br><ruby>星<rt>ほし</rt></ruby>が';
  const lines = parseRubyLines(html);
  assert.deepEqual(lines, [
    [
      { type: 'ruby', base: '夢', rt: 'ゆめ' },
      { type: 'text', text: 'を' },
      { type: 'ruby', base: '見', rt: 'み' },
      { type: 'text', text: 'たんだ' },
    ],
    [],
    [
      { type: 'ruby', base: '星', rt: 'ほし' },
      { type: 'text', text: 'が' },
    ],
  ]);
});

test('parseLyricsBlocks parses ruby lines paired with translations and stanza blanks', () => {
  const html = [
    '<ruby>夢<rt>ゆめ</rt></ruby>を<ruby>見<rt>み</rt></ruby>たんだ',
    '<p>我做了一个梦</p>',
    '<ruby>星<rt>ほし</rt></ruby>が',
    '<p>星辰</p>',
    '',
    '<ruby>風<rt>かぜ</rt></ruby>が',
    '<p>风儿</p>',
  ].join('\n');

  assert.deepEqual(parseLyricsBlocks(html), [
    {
      type: 'lyric',
      segments: [
        { type: 'ruby', base: '夢', rt: 'ゆめ' },
        { type: 'text', text: 'を' },
        { type: 'ruby', base: '見', rt: 'み' },
        { type: 'text', text: 'たんだ' },
      ],
      translation: '我做了一个梦',
    },
    {
      type: 'lyric',
      segments: [
        { type: 'ruby', base: '星', rt: 'ほし' },
        { type: 'text', text: 'が' },
      ],
      translation: '星辰',
    },
    { type: 'blank' },
    {
      type: 'lyric',
      segments: [
        { type: 'ruby', base: '風', rt: 'かぜ' },
        { type: 'text', text: 'が' },
      ],
      translation: '风儿',
    },
  ]);
});

test('parseLyricsBlocks handles <br> separators around <p> and partial streaming <p>', () => {
  const html = '<ruby>夢<rt>ゆめ</rt></ruby><br><p>梦境</p><br><br><ruby>星<rt>ほし</rt></ruby><br><p>正在流式生成';
  assert.deepEqual(parseLyricsBlocks(html), [
    {
      type: 'lyric',
      segments: [{ type: 'ruby', base: '夢', rt: 'ゆめ' }],
      translation: '梦境',
    },
    { type: 'blank' },
    {
      type: 'lyric',
      segments: [{ type: 'ruby', base: '星', rt: 'ほし' }],
      translation: '正在流式生成',
    },
  ]);
});

test('rubyHtmlToBracketText converts ruby markup with and without translations', () => {
  const plain = '<ruby>手<rt>て</rt></ruby>を<ruby>伸<rt>の</rt></ruby>ばせば<br><ruby>届<rt>とど</rt></ruby>きそうで';
  assert.equal(rubyHtmlToBracketText(plain), '手(て)を伸(の)ばせば\n届(とど)きそうで');

  const withTrans = '<ruby>夢<rt>ゆめ</rt></ruby>を<ruby>見<rt>み</rt></ruby>たんだ\n<p>我做了一个梦</p>\n\n<ruby>星<rt>ほし</rt></ruby>が\n<p>星辰</p>';
  assert.equal(
    rubyHtmlToBracketText(withTrans, { showTranslation: true }),
    '夢(ゆめ)を見(み)たんだ\n我做了一个梦\n\n星(ほし)が\n星辰'
  );
  assert.equal(
    rubyHtmlToBracketText(withTrans, { showTranslation: false }),
    '夢(ゆめ)を見(み)たんだ\n\n星(ほし)が'
  );
});

test('renderLyricsHtml builds structured DOM HTML and respects showTranslation', () => {
  const html = '<ruby>夢<rt>ゆめ</rt></ruby>\n<p>梦</p>\n\n<ruby>星<rt>ほし</rt></ruby>\n<p>星</p>';
  assert.equal(
    renderLyricsHtml(html, { showTranslation: true }),
    '<div class="lyric-entry"><div class="lyric-jp"><ruby>夢<rt>ゆめ</rt></ruby></div><div class="lyric-trans">梦</div></div><div class="lyric-blank" aria-hidden="true"></div><div class="lyric-entry"><div class="lyric-jp"><ruby>星<rt>ほし</rt></ruby></div><div class="lyric-trans">星</div></div>'
  );
  assert.equal(
    renderLyricsHtml(html, { showTranslation: false }),
    '<div class="lyric-entry"><div class="lyric-jp"><ruby>夢<rt>ゆめ</rt></ruby></div></div><div class="lyric-blank" aria-hidden="true"></div><div class="lyric-entry"><div class="lyric-jp"><ruby>星<rt>ほし</rt></ruby></div></div>'
  );
});

test('parseNumberedTranslations extracts line-indexed translations from various formats', () => {
  const raw = '```\n[1] 试着活到了今天\n2. 只是影子越拉越长\n\n3：离别终究会来\n```';
  assert.deepEqual(parseNumberedTranslations(raw), {
    1: '试着活到了今天',
    2: '只是影子越拉越长',
    3: '离别终究会来',
  });
});

test('mergeRubyWithTranslations aligns numbered translations with ruby lines and stanza blanks', () => {
  const rubyHtml = '<ruby>今日<rt>きょう</rt></ruby>まで<br><ruby>僕<rt>ぼく</rt></ruby>の<ruby>影<rt>かげ</rt></ruby><br><br><ruby>別<rt>わか</rt></ruby>れは';
  const merged = mergeRubyWithTranslations(rubyHtml, {
    1: '试着活到了今天',
    2: '只是影子越拉越长',
  });
  assert.deepEqual(parseLyricsBlocks(merged), [
    {
      type: 'lyric',
      segments: [
        { type: 'ruby', base: '今日', rt: 'きょう' },
        { type: 'text', text: 'まで' },
      ],
      translation: '试着活到了今天',
    },
    {
      type: 'lyric',
      segments: [
        { type: 'ruby', base: '僕', rt: 'ぼく' },
        { type: 'text', text: 'の' },
        { type: 'ruby', base: '影', rt: 'かげ' },
      ],
      translation: '只是影子越拉越长',
    },
    { type: 'blank' },
    {
      type: 'lyric',
      segments: [
        { type: 'ruby', base: '別', rt: 'わか' },
        { type: 'text', text: 'れは' },
      ],
      translation: '',
    },
  ]);
});
