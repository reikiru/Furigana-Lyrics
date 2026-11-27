import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/js/config.js';
import '../src/js/ruby.js';
import '../src/js/api.js';

const { DEFAULT_PREFS } = globalThis.Furigana.config;
const { buildSystemPrompt } = globalThis.Furigana.api;

test('DEFAULT_PREFS defaults translationStyle to natural', () => {
  assert.equal(DEFAULT_PREFS.translationStyle, 'natural');
});

test('buildSystemPrompt returns ruby-only prompt when translate is false', () => {
  const prompt = buildSystemPrompt({ translate: false, translationStyle: 'natural' });
  assert.match(prompt, /<ruby>/);
  assert.doesNotMatch(prompt, /<p>/);
});

test('buildSystemPrompt defaults to natural translation style when translate is true', () => {
  const prompt = buildSystemPrompt({ translate: true });
  assert.match(prompt, /<p>/);
  assert.match(prompt, /natural|idiomatic|context/i);
  assert.doesNotMatch(prompt, /word-for-word literal translation only/i);
});

test('buildSystemPrompt supports literal translation style', () => {
  const naturalPrompt = buildSystemPrompt({ translate: true, translationStyle: 'natural' });
  const literalPrompt = buildSystemPrompt({ translate: true, translationStyle: 'literal' });
  assert.notEqual(naturalPrompt, literalPrompt);
  assert.match(literalPrompt, /<p>/);
  assert.match(literalPrompt, /literal|faithfully|wording/i);
});

test('buildSystemPrompt falls back to natural for unknown translationStyle', () => {
  const naturalPrompt = buildSystemPrompt({ translate: true, translationStyle: 'natural' });
  const fallbackPrompt = buildSystemPrompt({ translate: true, translationStyle: 'unknown-style' });
  assert.equal(fallbackPrompt, naturalPrompt);
});
