const cvReady = new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = () => {
    const cv = globalThis.cv;
    if (cv && typeof cv.then === "function") {
      Promise.resolve(cv).then(resolve, reject);
      return;
    }
    if (cv && typeof cv.Mat === "function") {
      resolve(cv);
      return;
    }
    if (Date.now() - started > 30000) {
      reject(new Error("OpenCV.js runtime did not become ready within 30 seconds"));
      return;
    }
    setTimeout(poll, 100);
  };
  poll();
});
export default cvReady;
