export async function loadOpenCvRuntime(timeoutMs = 30000) {
  const usable = async (candidate) => {
    if (!candidate) return null;
    try {
      const cv = typeof candidate.then === 'function' ? await candidate : candidate;
      return cv && typeof cv.Mat === 'function' ? cv : null;
    } catch {
      return null;
    }
  };

  let cv = await usable(globalThis.cv);
  if (cv) return cv;

  const id = 'techstark-opencv-v5-runtime';
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.src = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@5.0.0-release.1/dist/opencv.js';
    script.async = true;
    document.head.appendChild(script);
  }

  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    cv = await usable(globalThis.cv);
    if (cv) {
      globalThis.cv = cv;
      return cv;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('TechStark OpenCV.js runtime did not become ready within 30 seconds');
}
