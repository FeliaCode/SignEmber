import "server-only";
import type { Keypair } from "@solana/web3.js";
import { x402Client } from "@x402/core/client";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { registerExactSvmScheme as registerFacilitator } from "@x402/svm/exact/facilitator";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { registerExactSvmScheme as registerClient } from "@x402/svm/exact/client";
import { registerExactSvmScheme as registerServer } from "@x402/svm/exact/server";
import { toClientSvmSigner, toFacilitatorSvmSigner } from "@x402/svm";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { env } from "./env";
import { keypairFromEnv } from "./chain";

export const H = {
  required: "PAYMENT-REQUIRED",
  signature: "PAYMENT-SIGNATURE",
  response: "PAYMENT-RESPONSE",
} as const;

export {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  encodePaymentSignatureHeader,
};
export type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse };

/** Reads a 402 response: v2 header first, then a JSON body. */
export async function readPaymentRequired(res: Response): Promise<PaymentRequired | null> {
  const h = res.headers.get(H.required);
  if (h) {
    try {
      return decodePaymentRequiredHeader(h);
    } catch {
      /* fall through to body */
    }
  }
  try {
    const body = (await res.clone().json()) as PaymentRequired;
    return Array.isArray(body?.accepts) ? body : null;
  } catch {
    return null;
  }
}

/** Exactly one requirement we accept: exact scheme, our network, USDC. */
export function pickRequirement(pr: PaymentRequired): PaymentRequirements | null {
  return (
    pr.accepts.find(
      (a) => a.scheme === "exact" && a.network === env.network && a.asset === env.usdcMint && /^\d+$/.test(String(a.amount)),
    ) ?? null
  );
}

/** Signs a payment for exactly `req` (never another entry of `pr`) with the agent's key. */
export async function signPayment(agent: Keypair, pr: PaymentRequired, req: PaymentRequirements): Promise<PaymentPayload> {
  const signer = toClientSvmSigner(await createKeyPairSignerFromBytes(agent.secretKey));
  const client = new x402Client((_v, accepts) => {
    const hit = accepts.find((a) => a.scheme === req.scheme && a.network === req.network && a.asset === req.asset && a.payTo === req.payTo && String(a.amount) === String(req.amount));
    if (!hit) throw new Error("requirement changed");
    return hit;
  });
  registerClient(client, { signer, rpcUrl: env.rpcUrl } as Parameters<typeof registerClient>[1]);
  return client.createPaymentPayload({ ...pr, accepts: [req] });
}

type FacilitatorLike = ConstructorParameters<typeof x402ResourceServer>[0];

/**
 * X402_FACILITATOR_URL set -> that hosted facilitator.
 * Unset or "local" -> EmberSign's own in-process facilitator: it verifies the payer's signed transfer and submits it,
 * paying the network fee from FACILITATOR_KEY (default: the gas treasury). No third party, works on mainnet.
 */
async function facilitator(): Promise<FacilitatorLike> {
  if (env.facilitatorUrl && env.facilitatorUrl !== "local") return new HTTPFacilitatorClient({ url: env.facilitatorUrl });
  const kp = keypairFromEnv(process.env.FACILITATOR_KEY || env.gasTreasuryKey);
  const signer = toFacilitatorSvmSigner(await createKeyPairSignerFromBytes(kp.secretKey), { defaultRpcUrl: env.rpcUrl });
  kp.secretKey.fill(0);
  const f = new x402Facilitator();
  registerFacilitator(f, { signer, networks: env.network });
  return {
    verify: (p, r) => f.verify(p, r),
    settle: (p, r) => f.settle(p, r),
    getSupported: async () => f.getSupported() as Awaited<ReturnType<HTTPFacilitatorClient["getSupported"]>>,
  } as FacilitatorLike;
}

const g = globalThis as unknown as { __emberResourceServer?: Promise<x402ResourceServer> };
export function resourceServer(): Promise<x402ResourceServer> {
  return (g.__emberResourceServer ??= (async () => {
    const server = new x402ResourceServer(await facilitator());
    registerServer(server);
    await server.initialize();
    return server;
  })());
}
