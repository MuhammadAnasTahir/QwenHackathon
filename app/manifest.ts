import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "صحت ساتھی Sehat Saathi",
    short_name: "Sehat",
    description:
      "دوا کا ساتھی: نسخے کی تصویر لیں، آسان اردو میں سنیں، تصویر والے الارم پائیں۔",
    lang: "ur",
    dir: "rtl",
    display: "standalone",
    orientation: "portrait",
    start_url: "/",
    scope: "/",
    theme_color: "#059669",
    background_color: "#fafaf9",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
