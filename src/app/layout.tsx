
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CustomSessionProvider from "./SessionProvider";
import { ToastProvider } from "@/components/shared/ToastProvider";
import GlobalHeader from "@/components/shared/GlobalHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LernArena - Interaktive Lernplattform",
  description: "Eine moderne Lernplattform mit interaktiven Kursen und Quizzes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <head>
        <meta charSet="UTF-8" />
      </head>
  <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}>
        <CustomSessionProvider>
          <ToastProvider>
            <GlobalHeader />
            {children}
          </ToastProvider>
        </CustomSessionProvider>
      </body>
    </html>
  );
}
