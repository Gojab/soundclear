import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKGROUND_PRESETS,
  computeBackgroundPresentation,
  DEFAULT_CUSTOM_BACKGROUND,
  hasActiveCustomBackground,
  isSafeBackgroundImageUrl,
  normalizeCustomBackground,
  sanitizeHexColor,
} from './backgroundTheme';

test('sanitizeHexColor normalizes 3-digit and 6-digit hex and falls back safely', () => {
  assert.equal(sanitizeHexColor('#abc', '#000000'), '#AABBCC');
  assert.equal(sanitizeHexColor(' #2ee6a6 ', '#000000'), '#2EE6A6');
  assert.equal(sanitizeHexColor('javascript:alert(1)', '#09241B'), '#09241B');
  assert.equal(sanitizeHexColor('', '#09241B'), '#09241B');
});

test('isSafeBackgroundImageUrl allows safe image data URLs and HTTP/relative paths, blocks unsafe schemes', () => {
  assert.equal(isSafeBackgroundImageUrl('data:image/jpeg;base64,AQIDBA=='), true);
  assert.equal(isSafeBackgroundImageUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeBackgroundImageUrl('https://example.com/cover.jpg'), true);
  assert.equal(isSafeBackgroundImageUrl('/assets/bg.jpg'), true);
  assert.equal(isSafeBackgroundImageUrl('//evil.example/bg.jpg'), false);
  assert.equal(isSafeBackgroundImageUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isSafeBackgroundImageUrl('javascript:alert(1)'), false);
});

test('normalizeCustomBackground clamps numbers and falls back invalid modes or presets', () => {
  const normalized = normalizeCustomBackground({
    mode: 'invalid_mode' as unknown as 'default',
    presetId: 'non_existent',
    solidColor: 'bad',
    gradientFrom: '#123',
    gradientTo: '#abcdef',
    gradientAngle: 999,
    blurPx: -15,
    dimOpacity: 99,
    panelGlass: false,
    customImageName: '   studio-wallpaper.jpg   ',
  });

  assert.equal(normalized.mode, 'default');
  assert.equal(normalized.presetId, DEFAULT_CUSTOM_BACKGROUND.presetId);
  assert.equal(normalized.solidColor, DEFAULT_CUSTOM_BACKGROUND.solidColor);
  assert.equal(normalized.gradientFrom, '#112233');
  assert.equal(normalized.gradientTo, '#ABCDEF');
  assert.equal(normalized.gradientAngle, 360);
  assert.equal(normalized.blurPx, 0);
  assert.equal(normalized.dimOpacity, 90);
  assert.equal(normalized.panelGlass, false);
  assert.equal(normalized.customImageName, 'studio-wallpaper.jpg');
});

test('normalizeCustomBackground prefers explicit externalImageDataUrl when provided', () => {
  const withImg = normalizeCustomBackground(
    { mode: 'image', customImageDataUrl: null },
    'data:image/png;base64,AAAA',
  );
  assert.equal(withImg.customImageDataUrl, 'data:image/png;base64,AAAA');
  assert.equal(hasActiveCustomBackground(withImg), true);

  const cleared = normalizeCustomBackground(
    { mode: 'image', customImageDataUrl: 'data:image/png;base64,AAAA' },
    null,
  );
  assert.equal(cleared.customImageDataUrl, null);
  assert.equal(hasActiveCustomBackground(cleared), false);
});

test('computeBackgroundPresentation handles every background mode accurately', () => {
  const off = computeBackgroundPresentation(DEFAULT_CUSTOM_BACKGROUND);
  assert.equal(off.isActive, false);
  assert.equal(off.useGlassPanels, false);
  assert.equal(off.imageUrl, null);

  const presetImg = computeBackgroundPresentation(
    { ...DEFAULT_CUSTOM_BACKGROUND, mode: 'preset', presetId: BACKGROUND_PRESETS[0].id, blurPx: 16, dimOpacity: 60 },
    { resolvedPresetImageUrl: '/assets/emerald.jpg' },
  );
  assert.equal(presetImg.isActive, true);
  assert.equal(presetImg.imageUrl, '/assets/emerald.jpg');
  assert.equal(presetImg.blurPx, 16);
  assert.equal(presetImg.scrimOpacity, 0.6);

  const gradientPres = computeBackgroundPresentation({
    ...DEFAULT_CUSTOM_BACKGROUND,
    mode: 'gradient',
    gradientFrom: '#112233',
    gradientTo: '#445566',
    gradientAngle: 90,
    dimOpacity: 85,
  });
  assert.equal(gradientPres.isActive, true);
  assert.equal(gradientPres.backgroundCss, 'linear-gradient(90deg, #112233 0%, #445566 100%)');
  assert.equal(gradientPres.scrimOpacity, 0.65);

  assert.equal(DEFAULT_CUSTOM_BACKGROUND.blurPx, 0);

  const ambientPres = computeBackgroundPresentation(
    { ...DEFAULT_CUSTOM_BACKGROUND, mode: 'ambient', blurPx: 0 },
    {
      currentTrackThumbnail: 'https://lh3.googleusercontent.com/sample',
      ambientColor: { r: 20, g: 120, b: 90 },
    },
  );
  assert.equal(ambientPres.isActive, true);
  assert.equal(ambientPres.imageUrl, 'https://lh3.googleusercontent.com/sample');
  assert.equal(ambientPres.blurPx, 0);
  assert.ok(ambientPres.backgroundCss.includes('20, 120, 90'));
});
