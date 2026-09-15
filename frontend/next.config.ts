import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    let backend = process.env.BACKEND_INTERNAL_URL?.trim();
    // In local dev, if BACKEND_INTERNAL_URL is unset or accidentally pointing to Next.js itself (3000/3001),
    // default to http://localhost:5000 where Python Flask app.py runs.
    if (!backend || backend.includes(":3000") || backend.includes(":3001")) {
      backend = "http://localhost:5000";
    }
    return [
      {
        source: "/api/:path*",
        destination: `${backend.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
