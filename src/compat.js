// src/compat.js
// Universal WebExtensions API accessor for Chromium (chrome) and Firefox/Zen (browser).

export const extAPI = (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime)
  ? globalThis.browser
  : (typeof globalThis.chrome !== 'undefined' ? globalThis.chrome : null);
