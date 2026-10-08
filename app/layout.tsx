import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "EmberSign: your agent spends, your wallet keeps the money",
  description: "Give an AI agent a USDC budget with onchain limits. It pays other agents and x402 sellers and earns for you.",
};


const themeScript = `try{if(matchMedia('(prefers-color-scheme: dark)').matches&&localStorage.getItem('ember-theme')!=='light'||localStorage.getItem('ember-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
