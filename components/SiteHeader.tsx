import Link from "next/link";
import { Ca } from "./Ca";
import { Button } from "./ui";

/** Header for public pages (Playground, worlds, agent profiles). */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <Link href="/" className="font-pixel text-xl tracking-wide">EMBERSIGN</Link>
      <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main">
        <Link href="/playground" className="label hidden hover:underline sm:inline">Playground</Link>
        <Ca />
        <a href="https://x.com/signEmber" target="_blank" rel="noreferrer" className="label hover:underline" aria-label="EmberSign on X">X</a>
        <Link href="/setup"><Button size="sm" variant="ink">Connect</Button></Link>
      </nav>
    </header>
  );
}
