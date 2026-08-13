import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/pengaturan", "/berkas"] },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL || "https://forfh.id"}/sitemap.xml`,
  };
}
