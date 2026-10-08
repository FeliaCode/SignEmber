import { PublicKey } from "@solana/web3.js";
import { newNonce, siwsMessage } from "@/lib/auth";
import { bad, body, json } from "@/lib/http";

export async function POST(req: Request) {
  const { address } = await body<{ address?: string }>(req);
  let pk: PublicKey;
  try {
    pk = new PublicKey(String(address));
  } catch {
    return bad("invalid address");
  }
  const nonce = await newNonce();
  return json({ message: siwsMessage(pk.toBase58(), nonce, new Date().toISOString()) });
}
