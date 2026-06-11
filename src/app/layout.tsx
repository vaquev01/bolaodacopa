import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bolão Copa 2026",
  description:
    "Crie e gerencie seu próprio bolão da Copa do Mundo 2026 — regras configuráveis, ranking ao vivo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
