const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://home-automation-mauve-one.vercel.app";

export default function sitemap() {
  const publicRoutes = [
    "",
    "/faq",
    "/contact-sales",
    "/partner-program",
    "/privacy-policy",
    "/terms",
    "/terms-of-service",
  ];

  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.5,
  }));
}
