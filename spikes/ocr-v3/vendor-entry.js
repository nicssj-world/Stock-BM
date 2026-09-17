import { PaddleOCR } from '@paddleocr/paddleocr-js';
window.PaddleOCR = PaddleOCR;
window.dispatchEvent(new Event('paddleocr-vendor-ready'));
