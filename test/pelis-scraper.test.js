'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {parsePage} = require('../lib/pelis-scraper');
const base = 'https://pelisgratishds.com/pelicula/demo/';
test('extrae metadatos y fuente directa sin ejecutar scripts', () => {
  const result = parsePage('<script type="application/ld+json">{"@type":"Movie","name":"Demo","image":["https://example.org/poster.jpg"]}</script><video><source src="https://example.org/demo.mp4"></video>', base);
  assert.equal(result.meta.name, 'Demo');
  assert.equal(result.streams[0].url, 'https://example.org/demo.mp4');
  assert.equal(result.playbackVerified, false);
});
test('no presenta iframe como video', () => {
  const result = parsePage('<iframe src="https://example.org/e/demo"></iframe>', base);
  assert.equal(result.status, 'embed_candidates_only');
  assert.equal(result.streams.length, 0);
});
test('detecta verificación humana', () => {
  assert.equal(parsePage('<altcha-widget></altcha-widget>', base).status, 'verification_required');
});
test('descarta URL inseguras', () => {
  const result = parsePage('<source src="http://example.org/a.mp4"><source src="https://127.0.0.1/a.mp4"><source src="https://user:pass@example.org/a.mp4">', base);
  assert.equal(result.streams.length, 0);
});
