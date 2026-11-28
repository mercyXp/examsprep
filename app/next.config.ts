import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: "/admin/lessons",
        has: [{ type: "query", key: "module", value: "(?<moduleId>[0-9a-fA-F-]{32,36})" }],
        destination: "/admin/lessons/:moduleId",
        permanent: false,
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
