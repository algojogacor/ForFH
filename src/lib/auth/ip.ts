import { NextRequest } from "next/server";

/**
 * Safely extracts the client's IP address from request headers.
 * Checks provider/proxy headers in order of preference:
 * 1. cf-connecting-ip (Cloudflare)
 * 2. x-real-ip (Nginx / reverse proxies)
 * 3. x-forwarded-for (Standard header, taking the first/client IP)
 */
export function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor && forwardedFor.trim()) {
    const clientIp = forwardedFor.split(",")[0]?.trim();
    if (clientIp) {
      return clientIp;
    }
  }

  return "anonymous-client";
}
