/** @type {import('next').NextConfig} */
const nextConfig = {
  // Habilita src/instrumentation.ts (cron interno de sync no boot do servidor).
  // Default no Next 15; no 14.2 precisa do flag.
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
