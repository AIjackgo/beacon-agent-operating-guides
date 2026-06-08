#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { createHash, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

function agentIdFromPublicKey(publicKey) {
  const der = publicKey.export({ type: "spki", format: "der" });
  return "bcn_" + createHash("sha256").update(der).digest("hex").slice(0, 12);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function makeSignedEnvelope(kind, text, status = "healthy") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const body = {
    agent_id: agentIdFromPublicKey(publicKey),
    kind,
    nonce: randomBytes(12).toString("hex"),
    status,
    text,
    ts: Date.now(),
  };
  const payload = Buffer.from(canonicalJson(body));
  const signature = sign(null, payload, privateKey).toString("hex");
  const pubkey = publicKey.export({ type: "spki", format: "der" }).toString("hex");
  return {
    ...body,
    pubkey,
    sig: signature,
    signature_verified: verify(null, payload, publicKey, Buffer.from(signature, "hex")),
  };
}

const envelope = makeSignedEnvelope(
  "heartbeat",
  "agent online; accepting coordination work; no secrets in this payload"
);

console.log("[BEACON v2]");
console.log(JSON.stringify(envelope, null, 2));
console.log("[/BEACON]");

if (!envelope.signature_verified) {
  throw new Error("signature verification failed");
}
