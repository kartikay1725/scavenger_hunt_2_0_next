import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const externalBackend = process.env.BACKEND_INTERNAL_URL?.trim();
    // If an external backend URL is provided (e.g. Railway or custom domain), use it.
    if (externalBackend && !externalBackend.includes(":3000") && !externalBackend.includes(":3001")) {
      return [
        {
          source: "/api/:path*",
          destination: `${externalBackend.replace(/\/$/, "")}/api/:path*`,
        },
      ];
    }

    // In local dev, proxy to local Flask server on port 5000
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:5000/api/:path*",
        },
      ];
    }

    // In production on Vercel (single project), route to Python serverless function at /api/index.py
    return [
      {
        source: "/api/:path*",
        destination: "/api/index.py",
      },
    ];
  },
};

export default nextConfig;
