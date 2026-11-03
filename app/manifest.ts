import type { MetadataRoute } from "next";

// Web app manifest (E8): installable on a phone home screen, opens standalone. Icons are the
// committed renders in public/icons (sources in public/icons-src).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "grinflow — rescate de comida",
    short_name: "grinflow",
    description: "coordina el rescate de comida: publica sobrantes, aparta kilos y confirma la entrega.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f3",
    theme_color: "#10211d",
    categories: ["food", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
