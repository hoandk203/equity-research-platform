//@ts-check
const { join } = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker builds set NEXT_OUTPUT=standalone to ship a minimal server; local `next start` keeps the default.
  ...(process.env['NEXT_OUTPUT'] === 'standalone' ? { output: 'standalone' } : {}),
  // Monorepo: trace dependencies from the workspace root (libs/contracts, root node_modules).
  outputFileTracingRoot: join(__dirname, '../..'),
  poweredByHeader: false,
};

module.exports = nextConfig;
