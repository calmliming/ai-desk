import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * postgres.js 依赖 node:net / node:tls，不走打包、直接用 Node 原生 require。
   * （Next 内置的自动外置清单里有 pg，但没有 postgres。）
   */
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
