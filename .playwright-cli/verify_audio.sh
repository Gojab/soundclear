#!/usr/bin/env bash
set -euo pipefail
trap 'playwright-cli close >/dev/null 2>&1 || true' EXIT

playwright-cli open http://localhost:3000 --browser=chromium >/dev/null
playwright-cli resize 1440 900 >/dev/null

playwright-cli run-code "async page => {
  const consoleErrors = [];
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('WebSocket') && !txt.includes('favicon')) {
        consoleErrors.push(txt);
      }
    }
  });

  await page.addInitScript(() => {
    const audios = [];
    const OrigAudio = window.Audio;
    window.__scAudios = audios;
    window.Audio = function(...args) {
      const el = new OrigAudio(...args);
      audios.push(el);
      return el;
    };
    window.Audio.prototype = OrigAudio.prototype;

    const contexts = [];
    const analysers = [];
    window.__scContexts = contexts;
    window.__scAnalysers = analysers;
    const OrigCtx = window.AudioContext || window.webkitAudioContext;
    if (OrigCtx) {
      const origCreateAnalyser = OrigCtx.prototype.createAnalyser;
      OrigCtx.prototype.createAnalyser = function(...args) {
        const a = origCreateAnalyser.apply(this, args);
        analysers.push(a);
        return a;
      };
      const WrappedCtx = function(...args) {
        const c = new OrigCtx(...args);
        contexts.push(c);
        return c;
      };
      WrappedCtx.prototype = OrigCtx.prototype;
      window.AudioContext = WrappedCtx;
      if (window.webkitAudioContext) window.webkitAudioContext = WrappedCtx;
    }

    const msHandlers = {};
    window.__scMsHandlers = msHandlers;
    if (navigator.mediaSession && navigator.mediaSession.setActionHandler) {
      const origSet = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = function(action, fn) {
        if (fn) msHandlers[action] = fn;
        else delete msHandlers[action];
        return origSet(action, fn);
      };
    }

    // Allow overriding visibilityState cleanly for background playback regression test
    let mockVis = null;
    const origVisDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get() {
        return mockVis ?? (origVisDesc && origVisDesc.get ? origVisDesc.get.call(document) : 'visible');
      },
    });
    window.__setMockVisibility = (val) => {
      mockVis = val;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });

  function makeWav(seconds = 12, freq = 440) {
    const sr = 22050;
    const numSamples = sr * seconds;
    const dataSize = numSamples * 2;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sr, 24);
    buf.writeUInt32LE(sr * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 16000);
      buf.writeInt16LE(sample, 44 + i * 2);
    }
    return buf;
  }

  const wavBuf = makeWav(14, 440);
  let forceIframeMode = false;

  await page.route('**/api/stream/**', async route => {
    const url = route.request().url();
    if (url.includes('/meta')) {
      if (forceIframeMode) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            trackId: 'forcedIframe',
            available: false,
            fallbackMode: 'youtube-iframe',
            reason: 'Blocked in test',
            codec: 'Cloud Audio',
            bitrateKbps: null,
            sampleRateHz: null,
            ext: 'mp4',
            mimeType: 'audio/mp4',
            source: 'SoundClear Cloud',
            tier: 'high',
            cacheReady: false,
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          trackId: 'testStream1',
          available: true,
          fallbackMode: null,
          reason: null,
          codec: 'WAV',
          bitrateKbps: 352,
          sampleRateHz: 22050,
          ext: 'wav',
          mimeType: 'audio/wav',
          source: 'Test Stream',
          tier: 'high',
          cacheReady: true,
        }),
      });
    }
    const headers = route.request().headers();
    const range = headers['range'];
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? Math.min(parseInt(m[2], 10), wavBuf.length - 1) : wavBuf.length - 1;
      return route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': 'bytes ' + start + '-' + end + '/' + wavBuf.length,
          'Content-Length': String(end - start + 1),
          'Access-Control-Allow-Origin': '*',
        },
        body: wavBuf.subarray(start, end + 1),
      });
    }
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(wavBuf.length),
        'Access-Control-Allow-Origin': '*',
      },
      body: wavBuf,
    });
  });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  const firstPlay = page.locator('button[aria-label^=\"Putar \"]').first();
  await firstPlay.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
  await firstPlay.click();
  await page.waitForTimeout(1600);

  const inspectAudio = () => page.evaluate(() => {
    const analysers = window.__scAnalysers || [];
    let maxRms = 0;
    for (const a of analysers) {
      const buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      maxRms = Math.max(maxRms, Math.sqrt(s / buf.length));
    }
    const audios = (window.__scAudios || []).map((a, idx) => ({
      idx,
      src: a.src ? a.src.slice(0, 80) : '',
      paused: a.paused,
      muted: a.muted,
      volume: a.volume,
      readyState: a.readyState,
      currentTime: Number(a.currentTime.toFixed(3)),
      crossOrigin: a.crossOrigin,
      loop: a.loop,
    }));
    const playingAudios = audios.filter(a => !a.paused && !a.loop);
    return {
      contextCount: (window.__scContexts || []).length,
      contextState: window.__scContexts?.[0]?.state || null,
      maxRms: Number(maxRms.toFixed(4)),
      playingCount: playingAudios.length,
      playingAudios,
      keepalivePlaying: audios.some(a => !a.paused && a.loop),
      mediaSession: navigator.mediaSession ? {
        playbackState: navigator.mediaSession.playbackState,
        title: navigator.mediaSession.metadata?.title || null,
        artist: navigator.mediaSession.metadata?.artist || null,
        handlers: Object.keys(window.__scMsHandlers || {}),
      } : null,
    };
  });

  // TEST 1: Foreground WebAudio DSP playback
  const test1_foreground = await inspectAudio();

  // TEST 2A: Mute -> Unmute RMS verification via PlayerBar quick controls
  await page.locator('button[aria-label=\"Kontrol suara cepat\"]').first().click();
  await page.locator('button:has-text(\"Bisu\")').first().click();
  await page.waitForTimeout(350);
  const test2_muted = await inspectAudio();
  await page.locator('button:has-text(\"Dibisukan\")').first().click();
  await page.waitForTimeout(350);
  const test2_unmuted = await inspectAudio();
  // Close popover cleanly
  await page.locator('button[aria-label=\"Kontrol suara cepat\"]').first().click();

  // TEST 2B: MediaSession controls (pause -> play -> seekforward -> nexttrack)
  await page.evaluate(() => window.__scMsHandlers.pause?.());
  await page.waitForTimeout(350);
  const test2_msPaused = await inspectAudio();

  await page.evaluate(() => window.__scMsHandlers.play?.());
  await page.waitForTimeout(450);
  const beforeSeek = await inspectAudio();
  await page.evaluate(() => window.__scMsHandlers.seekforward?.({ seekOffset: 5 }));
  await page.waitForTimeout(350);
  const test2_msSeeked = await inspectAudio();

  await page.evaluate(() => window.__scMsHandlers.nexttrack?.());
  await page.waitForTimeout(1200);
  const test2_msNext = await inspectAudio();

  // TEST 2C: MediaSession seekto / seekbackward / previoustrack
  const beforeSeekTo = await inspectAudio();
  await page.evaluate(() => window.__scMsHandlers.seekto?.({ seekTime: 8 }));
  await page.waitForTimeout(300);
  const test2_msSeekTo = await inspectAudio();

  await page.evaluate(() => window.__scMsHandlers.seekbackward?.({ seekOffset: 3 }));
  await page.waitForTimeout(300);
  const test2_msSeekBack = await inspectAudio();

  await page.evaluate(() => window.__scMsHandlers.previoustrack?.());
  await page.waitForTimeout(1000);
  const test2_msPrev = await inspectAudio();

  // TEST 3A: Suspended AudioContext auto-resumes when resume() is allowed
  await page.evaluate(async () => {
    const ctx = window.__scContexts?.[0];
    if (ctx) await ctx.suspend();
  });
  await page.waitForTimeout(800);
  const test3_suspendedAutoResume = await inspectAudio();

  // TEST 3B: Blocked ctx.resume() (simulating iOS/OS interruption) -> auto-fallback to directDeck (crossOrigin === null)
  await page.evaluate(async () => {
    const ctx = window.__scContexts?.[0];
    if (ctx) {
      window.__origCtxResume = ctx.resume.bind(ctx);
      ctx.resume = async () => {};
      await ctx.suspend();
    }
  });
  await page.waitForTimeout(1000);
  const test3b_blockedFallbackToDirect = await inspectAudio();

  // Restore ctx.resume() and verify clean return to foreground DSP
  await page.evaluate(async () => {
    const ctx = window.__scContexts?.[0];
    if (ctx && window.__origCtxResume) {
      ctx.resume = window.__origCtxResume;
      await ctx.resume();
    }
  });
  await page.waitForTimeout(1000);
  const test3b_restoredToDsp = await inspectAudio();

  // TEST 4: Background visibilitychange (hidden -> continues advancing -> visible -> continues playing)
  await page.evaluate(() => window.__setMockVisibility('hidden'));
  await page.waitForTimeout(300);
  const bgStart = await inspectAudio();
  await page.waitForTimeout(800);
  const bgEnd = await inspectAudio();

  await page.evaluate(() => window.__setMockVisibility('visible'));
  await page.waitForTimeout(500);
  const fgRestored = await inspectAudio();

  // TEST 6: PlayerBar -> Buka Pengaturan Audio -> toggle Direct Mode (Mode Direct (Bypass DSP)) on and off while playing
  await page.locator('button[aria-label=\"Buka Pengaturan Audio\"]').first().click();
  await page.waitForTimeout(500);
  const directModeToggle = page.locator('[aria-label=\"Mode Direct (Bypass DSP)\"]').first();
  let test6_directOn = null;
  let test6_directOff = null;
  await directModeToggle.waitFor({ state: 'visible', timeout: 10000 });
  await directModeToggle.scrollIntoViewIfNeeded();
  await directModeToggle.click();
  await page.waitForTimeout(900);
  test6_directOn = await inspectAudio();
  await directModeToggle.click();
  await page.waitForTimeout(900);
  test6_directOff = await inspectAudio();

  await page.screenshot({ path: '.playwright-cli/r1-verified.png' });

  // TEST 5: Forced YouTube IFrame unavailable/blocked state -> NO fake MediaSession 'playing' or keepalive
  forceIframeMode = true;
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  const playBtn2 = page.locator('button[aria-label^=\"Putar \"]').first();
  await playBtn2.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(300);
  await playBtn2.click();
  await page.waitForTimeout(4200);
  const test5_ytUnstarted = await inspectAudio();

  const result = {
    test1_foreground,
    test2_muted,
    test2_unmuted,
    test2_msPaused,
    beforeSeekTime: beforeSeek.playingAudios[0]?.currentTime ?? null,
    test2_msSeeked,
    test2_msNext,
    beforeSeekToTime: beforeSeekTo.playingAudios[0]?.currentTime ?? null,
    test2_msSeekTo,
    test2_msSeekBack,
    test2_msPrev,
    test3_suspendedAutoResume,
    test3b_blockedFallbackToDirect,
    test3b_restoredToDsp,
    test4_background: {
      hiddenStartPlaying: bgStart.playingCount,
      hiddenStartTime: bgStart.playingAudios[0]?.currentTime ?? null,
      hiddenEndPlaying: bgEnd.playingCount,
      hiddenEndTime: bgEnd.playingAudios[0]?.currentTime ?? null,
      restored: fgRestored,
    },
    test6_directOn,
    test6_directOff,
    test5_ytUnstarted,
    consoleErrors,
  };
  await page.evaluate((res) => {
    console.info('SC_VERIFY_JSON:' + JSON.stringify(res));
  }, result);
  try {
    const fs = await import('node:fs');
    fs.writeFileSync('/app/applet/.playwright-cli/verify_result.json', JSON.stringify(result, null, 2));
  } catch (e) {
    result.fsError = String(e);
  }
  return result;
}"
