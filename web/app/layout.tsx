import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FocusReplay",
  description: "Replay de travail privé.",
  robots: { index: false, follow: false },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}

