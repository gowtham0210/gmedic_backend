const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // multer uses Node-only APIs; node:sqlite is a newer builtin Turbopack
  // doesn't try to bundle yet — both must stay external, resolved by Node
  // directly at runtime rather than bundled.
  serverExternalPackages: ['multer', 'node:sqlite'],
  turbopack: { root: path.join(__dirname) },
  // The patient app (including its Flutter web build) calls /api/patient from another origin. It authenticates
  // with a bearer token, never cookies, so allowing any origin does not expose the portals' cookie sessions.
  async headers() {
    return [{
      source: '/api/patient/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type, X-Simulate-Payment' },
        { key: 'Access-Control-Max-Age', value: '86400' },
      ],
    }];
  },
};

module.exports = nextConfig;
