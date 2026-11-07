const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://home-automation-mauve-one.vercel.app";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/login/",
        "/profile/",
        "/settings/",
        "/setup/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
