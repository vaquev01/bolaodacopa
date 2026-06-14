import type { Metadata, Viewport } from "next";
import "./globals.css";
import EmojiFlagPolyfill from "./EmojiFlagPolyfill";

export const viewport: Viewport = {
  themeColor: "#005BBB",
};

export const metadata: Metadata = {
  title: {
    default: "Bolão da Copa 2026",
    template: "%s — Bolão da Copa 2026",
  },
  description:
    "Faça seus palpites, acompanhe o ranking e dispute com os amigos na Copa do Mundo 2026.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://bolao-da-copa.up.railway.app"
  ),
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Bolão da Copa 2026",
    title: "Bolão da Copa 2026",
    description:
      "Faça seus palpites, acompanhe o ranking e dispute com os amigos na Copa do Mundo 2026.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Bolão da Copa 2026 — Palpite com seus amigos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bolão da Copa 2026",
    description:
      "Faça seus palpites, acompanhe o ranking e dispute com os amigos na Copa do Mundo 2026.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <EmojiFlagPolyfill />
        {children}
      </body>
    </html>
  );
}
