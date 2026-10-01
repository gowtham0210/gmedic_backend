const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // multer uses Node-only APIs; node:sqlite is a newer builtin Turbopack
  // doesn't try to bundle yet — both must stay external, resolved by Node
  // directly at runtime rather than bundled.
  serverExternalPackages: ['multer', 'node:sqlite'],
  turbopack: { root: path.join(__dirname) },
};

module.exports = nextConfig;
