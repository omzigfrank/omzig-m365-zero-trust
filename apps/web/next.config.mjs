/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  // Monorepo: transpile workspace packages
  transpilePackages: ["@omzig/audit", "@omzig/shared"],
};

export default nextConfig;
