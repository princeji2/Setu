'use strict';

/**
 * Minimal static file server for the Setu citizen frontend.
 * No build tool, no bundler — vanilla HTML/CSS/JS served as-is (per the
 * Phase 5 decision to keep the frontend lean for the SIH26129 deadline).
 *
 * Runs on port 3000 by default, matching the gateway's CORS_ORIGINS
 * allowlist (gateway/.env: http://localhost:3000). Serving from a real
 * http:// origin (rather than file://) matters — the gateway's CORS
 * middleware checks the Origin header, and a file:// page sends the
 * literal string "null" as its origin, which the allowlist rejects.
 *
 *   node server.js            # serves ./public on http://localhost:3000
 *   PORT=3000 node server.js  # explicit port
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));

  // Prevent path traversal outside ./public
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA-style fallback: unknown paths (e.g. a future deep link) get
      // index.html so client-side view switching still works on refresh.
      if (err.code === 'ENOENT' && !path.extname(filePath)) {
        return fs.readFile(path.join(ROOT, 'index.html'), (err2, indexData) => {
          if (err2) {
            res.writeHead(404);
            return res.end('Not found');
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(indexData);
        });
      }
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[frontend] Setu citizen app running on http://localhost:${PORT}`);
  console.log(`[frontend] Expects the gateway API at http://localhost:4000/api/v1`);
});
