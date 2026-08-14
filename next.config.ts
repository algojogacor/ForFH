import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Build artifact standalone untuk container (Koyeb/Vercel) — image kecil,
  // tidak perlu node_modules penuh di runtime; jalan via node server.js.
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // WAJIB: Baileys + ws + whatsapp-rust-bridge TIDAK boleh di-bundle Next.js.
    // Kalau di-bundle, ws (CJS) kehilangan implementasi masking → koneksi WA
    // mati dengan "WebSocket Error (e.mask is not a function)" → bad_session.
    // Bundling juga rusak karena whatsapp-rust-bridge ESM-only (exports hanya
    // "import" → require() → ERR_PACKAGE_PATH_NOT_EXPORTED). External → dipakai
    // dari node_modules runtime (ikut ter-copy ke output standalone).
    serverComponentsExternalPackages: ["@whiskeysockets/baileys", "ws", "whatsapp-rust-bridge"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
