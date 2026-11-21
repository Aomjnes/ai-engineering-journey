import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jsdom and the LLM SDKs must stay as real Node modules on the server.
  serverExternalPackages: ["jsdom", "@mozilla/readability", "rss-parser", "node-cron"],
};

export default nextConfig;
