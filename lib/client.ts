"use client";
// Browser helpers. Never imports server modules.
import { useCallback, useEffect, useState } from "react";
import { Connection, Transaction, type VersionedTransaction } from "@solana/web3.js";

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** The browser talks to Solana through our /api/rpc proxy, so the RPC provider key never reaches the page. */
export const rpcEndpoint = () => (typeof window === "undefined" ? "http://localhost/api/rpc" : `${window.location.origin}${BASE}/api/rpc`);
export const CLUSTER = process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ?? "mainnet-beta";
export const href = (p: string) => `${BASE}${p}`;
const clusterQs = () => (CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`);
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${clusterQs()}`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}${clusterQs()}`;

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(href(path), {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error ?? `request failed (${res.status})`);
  return data;
}

export interface Me {
  address: string;
  handle: string | null;
  agent: string | null;
  agentSol: number;
  allowancePda: string;
  active: boolean;
  revoked: boolean;
  configured: boolean;
  dailyCapUsd: number;
  perTxCapUsd: number;
  leftTodayUsd: number;
  approvedUsd: number;
  ownerUsdcUsd: number;
  floatUsd: number;
  askAboveUsd: number;
  usdcMint: string;
  network: string;
  appUrl: string;
  cluster: string;
}

/** Loads /api/me; `me` is null when signed out. */
export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const reload = useCallback(async () => {
    try {
      setMe((await api<Me | null>("/api/me")) ?? null);
    } catch {
      setMe(null);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { me, reload };
}

export function useJson<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload };
}

export const conn = () => new Connection(rpcEndpoint(), "confirmed");

type Signer = (tx: Transaction) => Promise<Transaction | VersionedTransaction>;

/** Wallet signs, we send and confirm (by polling, no websocket through the proxy). Returns the signature. */
export async function signSendConfirm(tx: Transaction, signTransaction: Signer): Promise<string> {
  const c = conn();
  if (!tx.recentBlockhash) tx.recentBlockhash = (await c.getLatestBlockhash("confirmed")).blockhash;
  const signed = await signTransaction(tx);
  const sig = await c.sendRawTransaction(signed.serialize());
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = (await c.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error("transaction failed on chain");
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
  }
  throw new Error("not confirmed yet; check the explorer before retrying");
}

export const usd = (n: number) => `$${n < 0.1 && n > 0 ? n.toFixed(3) : n.toFixed(2)}`;
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
