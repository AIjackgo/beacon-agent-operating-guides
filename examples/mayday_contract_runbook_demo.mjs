#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { createHash, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function makeIdentity() {
  const pair = generateKeyPairSync("ed25519");
  const publicDer = pair.publicKey.export({ type: "spki", format: "der" });
  return {
    ...pair,
    agentId: "bcn_" + createHash("sha256").update(publicDer).digest("hex").slice(0, 12),
    pubkey: publicDer.toString("hex"),
  };
}

function signEnvelope(identity, fields) {
  const body = {
    agent_id: identity.agentId,
    nonce: randomBytes(12).toString("hex"),
    ts: Date.now(),
    ...fields,
  };
  const payload = Buffer.from(canonicalJson(body));
  const sig = sign(null, payload, identity.privateKey).toString("hex");
  return {
    ...body,
    pubkey: identity.pubkey,
    sig,
    verified: verify(null, payload, identity.publicKey, Buffer.from(sig, "hex")),
  };
}

const identity = makeIdentity();
const contract = signEnvelope(identity, {
  kind: "accord_offer",
  service: "nightly-index-refresh",
  objective: "publish a fresh index and heartbeat every 15 minutes",
  heartbeat_slo_seconds: 900,
  mayday_after_missed_beats: 2,
});

const heartbeat = signEnvelope(identity, {
  kind: "heartbeat",
  status: "degraded",
  contract_nonce: contract.nonce,
  text: "index refresh is delayed; continuing retries",
});

const mayday = signEnvelope(identity, {
  kind: "mayday",
  severity: "planned-handoff",
  contract_nonce: contract.nonce,
  reason: "maintenance window; need another agent to watch the queue",
  handoff_state: {
    queue: "nightly-index-refresh",
    last_safe_checkpoint: "2026-06-08T00:00:00Z",
  },
});

for (const envelope of [contract, heartbeat, mayday]) {
  if (!envelope.verified) throw new Error(`${envelope.kind} signature failed`);
}

console.log(JSON.stringify({ agent_id: identity.agentId, contract, heartbeat, mayday }, null, 2));
