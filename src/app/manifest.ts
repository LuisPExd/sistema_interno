import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corpotex Planta",
    short_name: "Corpotex",
    description: "Seguimiento de pedidos por área",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f8",
    theme_color: "#17245f",
    icons: [{ src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
