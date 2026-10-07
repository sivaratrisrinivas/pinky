import { AddressType, BrowserSDK } from "@phantom/browser-sdk";
import { Connection, Transaction } from "@solana/web3.js";

const DEVNET_RPC = "https://api.devnet.solana.com";
const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

type Refusal = "closed" | "promised" | "unknown-issue" | "not-a-project";
type Status = ({ state: "ready"; amount: string } | { state: Refusal }) & { phantomAppId: string | null };

const MESSAGES: Record<Refusal, string> = {
  closed: "This issue is closed, so there's nothing to promise for.",
  promised: "This promise is already made.",
  "unknown-issue": "We can't find that issue. Check the link in the bot's comment.",
  "not-a-project": "This repo isn't set up with Pinky.",
};

const params = new URLSearchParams(location.search);
const repo = params.get("repo") ?? "";
const number = params.get("n") ?? "";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const summary = $("summary");
const message = $("message");
const actions = $("actions");

function say(text: string, kind: "info" | "error" | "done" = "info") {
  message.textContent = text;
  message.dataset.kind = kind;
}

function button(label: string, onClick: () => void | Promise<void>, secondary = false) {
  const el = document.createElement("button");
  el.textContent = label;
  if (secondary) el.className = "secondary";
  el.addEventListener("click", async () => {
    el.disabled = true;
    try {
      await onClick();
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), "error");
      el.disabled = false;
    }
  });
  return el;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}

function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function main() {
  summary.textContent = repo && number ? `${repo} #${number}` : "";
  const response = await fetch(`/api/pay?${new URLSearchParams({ repo, n: number })}`);
  const status = (await response.json()) as Status;
  if (!response.ok) return say("This link is missing its issue. Use the one in the bot's comment.", "error");
  if (status.state !== "ready") return say(MESSAGES[status.state], status.state === "promised" ? "done" : "info");

  const dollars = Number(status.amount) / 1_000_000;
  say(`A promise is ${dollars} test USDC. You get it back unless a maintainer marks this as spam.`);

  const providers = status.phantomAppId ? (["google", "injected"] as const) : (["injected"] as const);
  const sdk = new BrowserSDK({
    providers: [...providers],
    addressTypes: [AddressType.solana],
    ...(status.phantomAppId ? { appId: status.phantomAppId } : {}),
  });

  const wallet = sdk.isConnected() ? sdk.getAddresses()[0]?.address : undefined;
  if (wallet) return showPromiseSteps(sdk, wallet);

  actions.replaceChildren();
  if (status.phantomAppId) {
    actions.append(
      button("Sign in with Google", async () => {
        const { addresses } = await sdk.connect({ provider: "google" });
        showPromiseSteps(sdk, addresses[0]!.address);
      })
    );
  }
  actions.append(
    button(
      status.phantomAppId ? "I already use Phantom" : "Connect Phantom",
      async () => {
        const { addresses } = await sdk.connect({ provider: "injected" });
        showPromiseSteps(sdk, addresses[0]!.address);
      },
      Boolean(status.phantomAppId)
    )
  );
}

function showPromiseSteps(sdk: BrowserSDK, wallet: string) {
  say(`Signed in as ${wallet.slice(0, 4)}…${wallet.slice(-4)}. First get some test USDC.`);
  actions.replaceChildren(
    button("Get test USDC", async () => {
      await post("/api/faucet", { wallet });
      say("Test USDC is on its way. Now make the promise.");
      actions.replaceChildren(button("Make the promise", () => makePromise(sdk, wallet)));
    })
  );
}

async function makePromise(sdk: BrowserSDK, wallet: string) {
  say("Waiting for your wallet to sign…");
  const prepared = await post<{ state: string; transaction?: string }>("/api/deposit-tx", {
    repo,
    n: Number(number),
    wallet,
  });
  if (prepared.state !== "ready" || !prepared.transaction) {
    return say(MESSAGES[prepared.state as Refusal] ?? "Can't make this promise right now.");
  }

  const signed = await sdk.solana.signTransaction(Transaction.from(bytesFromBase64(prepared.transaction)));
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const signature = await connection.sendRawTransaction((signed as Transaction).serialize());
  say("Sent. Confirming…");
  await connection.confirmTransaction(signature, "confirmed");

  say("Promise made. Thank you!", "done");
  const link = document.createElement("a");
  link.href = explorerTx(signature);
  link.textContent = "View it on Solana Explorer";
  link.target = "_blank";
  link.rel = "noopener";
  actions.replaceChildren(link);
}

main().catch((error) => say(error instanceof Error ? error.message : String(error), "error"));
