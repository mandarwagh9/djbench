import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.dirname(new URL(import.meta.url).pathname.slice(1)),
};
export default nextConfig;
