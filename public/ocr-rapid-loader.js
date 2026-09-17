import * as EsearchOCR from 'https://cdn.jsdelivr.net/npm/esearch-ocr@5.1.5/dist/esearch-ocr.js';
window.EsearchOCR = EsearchOCR;
window.dispatchEvent(new Event('esearch-ocr-ready'));
