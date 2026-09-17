import { loadOpenCvRuntime } from '/ocr-opencv-loader-v4.js';

try {
  const cv = await loadOpenCvRuntime();
  window.cv = cv;
  window.dispatchEvent(new Event('opencv-ready'));
} catch (error) {
  console.error('OpenCV bootstrap failed', error);
}

import * as EsearchOCR from 'https://cdn.jsdelivr.net/npm/esearch-ocr@5.1.5/dist/esearch-ocr.js';
window.EsearchOCR = EsearchOCR;
window.dispatchEvent(new Event('esearch-ocr-ready'));
