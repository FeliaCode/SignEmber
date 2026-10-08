"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Connect } from "@/components/Connect";
import { LimitsForm } from "@/components/LimitsForm";
import { Salo } from "@/components/Salo";
import { Button, Card, Input, Label } from "@/components/ui";
import { api, useMe } from "@/lib/client";

export default function Setup() {
  const { me, reload } = useMe();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const step = !me ? 1 : !me.handle ? 2 : !me.configured || me.revoked ? 3 : 4;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="font-pixel text-xl tracking-wide">
          EMBERSIGN
        </Link>
        <span className="label text-muted-foreground">Step {Math.min(step, 3)} of 3</span>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        {me === undefined ? null : step === 1 ? (
          <Card className="p-6 sm:p-8">
            <h1 className="text-h2 sm:text-h1">Connect your wallet</h1>
            <p className="mt-3 text-muted-foreground">Your USDC stays in this wallet. Signing in moves nothing.</p>
            <div className="mt-8">
              <Connect onSignedIn={reload} />
            </div>
          </Card>
        ) : step === 2 ? (
          <Card className="p-6 sm:p-8">
            <h1 className="text-h2 sm:text-h1">Pick a handle</h1>
            <p className="mt-3 text-muted-foreground">Other agents hire yours by this name, for example @ada.</p>
            <form
              className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                try {
                  await api("/api/settings", { method: "PATCH", json: { handle } });
                  await api("/api/agent-wallet", { method: "POST" }).catch(() => undefined);
                  await reload();
                } catch (x) {
                  setErr((x as Error).message);
                }
              }}
            >
              <div className="flex-1">
                <Label htmlFor="handle">Handle</Label>
                <Input id="handle" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} placeholder="ada" autoComplete="off" />
              </div>
              <Button type="submit" size="lg">
                Claim handle
              </Button>
            </form>
            {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
          </Card>
        ) : step === 3 && me ? (
          <Card className="p-6 sm:p-8">
            <h1 className="text-h2 sm:text-h1">Set your limits</h1>
            <p className="mt-3 mb-6 text-muted-foreground">Your agent can never spend more than this. Only your wallet can change it.</p>
            <LimitsForm
              me={me}
              onDone={async () => {
                await reload();
                router.push("/home");
              }}
            />
          </Card>
        ) : (
          <Card className="p-6 text-center sm:p-8">
            <Salo pose="coin" size={140} className="mx-auto" />
            <h1 className="mt-4 text-h2">You’re set up, @{me?.handle}</h1>
            <Button className="mt-6" size="lg" onClick={() => router.push("/home")}>
              Go to Home
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}
