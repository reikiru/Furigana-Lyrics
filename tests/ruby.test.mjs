import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/js/ruby.js';

const {
  stripCodeFence,
  sanitizeRubyHtml,
  parseRubyLines,
  rubyHtmlToBracketText,
} = globalThis.Furigana.ruby;

test('stripCodeFence removes markdown html fences', () => {
  assert.equal(stripCodeFence('```html\n<ruby>夢<rt>ゆめ</rt></ruby>\n```'), '<ruby>夢<rt>ゆめ</rt></ruby>');
  assert.equal(stripCodeFence('```\nテスト\n```'), 'テスト');
});

test('sanitizeRubyHtml keeps ruby/rt/br and escapes unsafe tags & attributes', () => {
  const input = '<ruby class="x">夜空<rt onclick="alert(1)">よぞら</rt></ruby><br/><script>bad()</script>';
  const output = sanitizeRubyHtml(input);
  assert.equal(output, '<ruby>夜空<rt>よぞら</rt></ruby><br>&lt;script&gt;bad()&lt;/script&gt;');
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

test('rubyHtmlToBracketText converts ruby markup into readable plain text', () => {
  const html = '<ruby>手<rt>て</rt></ruby>を<ruby>伸<rt>の</rt></ruby>ばせば<br><ruby>届<rt>とど</rt></ruby>きそうで';
  assert.equal(rubyHtmlToBracketText(html), '手(て)を伸(の)ばせば\n届(とど)きそうで');
});
