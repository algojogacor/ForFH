import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Build artifact standalone untuk container (Koyeb/Vercel) — image kecil,
  // tidak perlu node_modules penuh di runtime; jalan via node server.js.
  output: "standalone",
  // WAJIB: Baileys + ws + whatsapp-rust-bridge TIDAK boleh di-bundle Next.js.
  // External → dipakai dari node_modules runtime (ikut ter-copy ke output standalone).
  serverExternalPackages: ["@whiskeysockets/baileys", "ws", "whatsapp-rust-bridge"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
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
