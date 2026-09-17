const ort = globalThis.ort;
if (!ort) throw new Error("ONNX Runtime global is not loaded");
export const env = ort.env;
export const InferenceSession = ort.InferenceSession;
export const Tensor = ort.Tensor;
export default ort;
