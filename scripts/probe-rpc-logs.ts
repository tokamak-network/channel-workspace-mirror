import { parseArgs } from "node:util";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { mainnet } from "viem/chains";
import { loadLocalEnv } from "../lib/env";

loadLocalEnv();

type ProbeMode = "raw" | "viem" | "both";

type ProbeCase = {
  label: string;
  fromBlock: bigint;
  toBlock: bigint;
};

const { values } = parseArgs({
  options: {
    "rpc-url": { type: "string" },
    address: { type: "string" },
    topic: { type: "string" },
    "from-block": { type: "string" },
    "to-block": { type: "string" },
    ranges: { type: "string", default: "3000,1000,500,100,50" },
    mode: { type: "string", default: "both" },
    "timeout-ms": { type: "string", default: "120000" },
  },
});

async function main() {
  const rpcUrl = requiredString(values["rpc-url"] ?? process.env.RPC_URL, "rpc-url");
  const address = requiredString(values.address, "address") as Address;
  const topic = requiredString(values.topic, "topic") as Hex;
  const fromBlock = BigInt(requiredString(values["from-block"], "from-block"));
  const toBlock = BigInt(requiredString(values["to-block"], "to-block"));
  const mode = probeMode(values.mode);
  const timeoutMs = positiveInteger(Number(values["timeout-ms"]), "timeout-ms");
  const ranges = String(values.ranges)
    .split(",")
    .map((value) => BigInt(value.trim()))
    .filter((value) => value > 0n);

  const cases: ProbeCase[] = [
    { label: "full", fromBlock, toBlock },
    ...ranges.map((range) => ({
      label: `${range.toString()} blocks`,
      fromBlock,
      toBlock: minBigInt(toBlock, fromBlock + range - 1n),
    })),
  ];

  for (const probeCase of cases) {
    if (mode === "raw" || mode === "both") {
      await runRawProbe(rpcUrl, address, topic, probeCase, timeoutMs);
    }
    if (mode === "viem" || mode === "both") {
      await runViemProbe(rpcUrl, address, topic, probeCase, timeoutMs);
    }
  }
}

async function runRawProbe(rpcUrl: string, address: Address, topic: Hex, probeCase: ProbeCase, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getLogs",
        params: [{
          address,
          topics: [topic],
          fromBlock: hexBlock(probeCase.fromBlock),
          toBlock: hexBlock(probeCase.toBlock),
        }],
      }),
    });
    const body = await response.json() as { result?: unknown[]; error?: unknown };
    if (!response.ok || body.error) {
      throw new Error(JSON.stringify(body.error ?? { status: response.status }));
    }
    printResult("raw", probeCase, performance.now() - started, "ok", body.result?.length ?? 0);
  } catch (error) {
    printResult("raw", probeCase, performance.now() - started, "failed", null, error);
  } finally {
    clearTimeout(timeout);
  }
}

async function runViemProbe(rpcUrl: string, address: Address, topic: Hex, probeCase: ProbeCase, timeoutMs: number) {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl, { timeout: timeoutMs }),
  });
  const started = performance.now();
  try {
    const logs = await client.request({
      method: "eth_getLogs",
      params: [{
        address,
        topics: [topic],
        fromBlock: hexBlock(probeCase.fromBlock),
        toBlock: hexBlock(probeCase.toBlock),
      }],
    });
    printResult("viem", probeCase, performance.now() - started, "ok", Array.isArray(logs) ? logs.length : 0);
  } catch (error) {
    printResult("viem", probeCase, performance.now() - started, "failed", null, error);
  }
}

function printResult(
  client: "raw" | "viem",
  probeCase: ProbeCase,
  elapsedMs: number,
  status: "ok" | "failed",
  logCount: number | null,
  error?: unknown,
) {
  console.log(JSON.stringify({
    client,
    label: probeCase.label,
    fromBlock: probeCase.fromBlock.toString(),
    toBlock: probeCase.toBlock.toString(),
    span: (probeCase.toBlock - probeCase.fromBlock + 1n).toString(),
    elapsedMs: Math.round(elapsedMs),
    status,
    logCount,
    error: error ? errorMessage(error) : null,
  }));
}

function probeMode(value: unknown): ProbeMode {
  if (value === "raw" || value === "viem" || value === "both") {
    return value;
  }
  throw new Error("mode must be raw, viem, or both.");
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function positiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function hexBlock(value: bigint): Hex {
  return `0x${value.toString(16)}`;
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
