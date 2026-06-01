import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paggo Triage — Inbox de Suporte",
  description: "Ferramenta de triagem para head de suporte ao cliente",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full flex flex-col bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
