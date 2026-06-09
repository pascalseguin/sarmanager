import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'bcryptjs'],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
