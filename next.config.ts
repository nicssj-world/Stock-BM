import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The annual vendor report PDF reads its Thai fonts and logo from disk at runtime, which file tracing cannot see.
  outputFileTracingIncludes: {
    "/api/vendors/[id]/evaluations/[revisionId]/pdf": [
      "./node_modules/font-th-sarabun-new/fonts/THSarabunNew-webfont.ttf",
      "./node_modules/font-th-sarabun-new/fonts/THSarabunNew_bold-webfont.ttf",
      "./public/images/cbh-lab-logo-v3.png",
    ],
  },
};

export default nextConfig;
