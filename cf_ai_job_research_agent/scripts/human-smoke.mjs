/**
 * Mimics browser useAgentChat: WebSocket + stream resume + chat POST body.
 * Run with dev server: pnpm dev (http://127.0.0.1:8787)
 */
const BASE = process.env.JRA_TEST_URL ?? "ws://127.0.0.1:8787";
const SESSION = crypto.randomUUID();

function connect() {
  const path = `/agents/job-research-agent/${SESSION}`;
  const ws = new WebSocket(`${BASE.replace(/\/$/, "")}${path}`);
  return ws;
}

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("WebSocket open timeout")), 15000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function collectChatStream(ws, requestId, timeoutMs) {
  const uiChunks = [];
  let done = false;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (!done) reject(new Error(`Stream timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    function onMsg(ev) {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (data.type !== "cf_agent_use_chat_response") return;
      if (data.id !== requestId) return;
      if (data.error) {
        done = true;
        clearTimeout(t);
        ws.removeEventListener("message", onMsg);
        reject(new Error(data.body || "Stream error"));
        return;
      }
      const b = data.body?.trim();
      if (b) {
        try {
          uiChunks.push(JSON.parse(b));
        } catch {
          uiChunks.push({ _raw: b });
        }
      }
      if (data.done) {
        done = true;
        clearTimeout(t);
        ws.removeEventListener("message", onMsg);
        resolve(uiChunks);
      }
    }
    ws.addEventListener("message", onMsg);
  });
}

function rid() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

async function sendTurn(ws, text, timeoutMs) {
  const userId = crypto.randomUUID();
  const messages = [
    {
      id: userId,
      role: "user",
      parts: [{ type: "text", text }],
    },
  ];
  const bodyPayload = JSON.stringify({
    messages,
    trigger: "submit-message",
  });
  const requestId = rid();
  const p = collectChatStream(ws, requestId, timeoutMs);
  ws.send(
    JSON.stringify({
      id: requestId,
      type: "cf_agent_use_chat_request",
      init: { method: "POST", body: bodyPayload },
    }),
  );
  return p;
}

function summarizeChunks(chunks) {
  const types = chunks.map((c) => c.type).filter(Boolean);
  const toolRelated = chunks.filter(
    (c) =>
      typeof c.type === "string" &&
      (c.type.startsWith("tool-") ||
        c.type.includes("tool-input") ||
        c.type.includes("tool-output")),
  );
  const textDeltas = chunks
    .filter((c) => c.type === "text-delta")
    .map((c) => c.delta)
    .join("");
  return { types, toolRelatedCount: toolRelated.length, textPreview: textDeltas.slice(0, 400) };
}

async function main() {
  console.log("Session", SESSION);
  const ws = connect();
  await waitOpen(ws);
  ws.send(JSON.stringify({ type: "cf_agent_stream_resume_request" }));
  await new Promise((r) => setTimeout(r, 500));

  console.log("\n--- Turn 1: job posting (expect analysis + card chunks) ---");
  const jobText = `Staff Software Engineer — Edge Platform
Acme Cloud Ltd.
We are hiring a Staff SWE to work on our HTTP proxy and Workers runtime. You will lead design reviews, write Rust and TypeScript, and partner with product on reliability SLOs. Requirements: 7+ years backend, experience with distributed systems, strong communication. Location: remote within US/EU time zones.`;

  const chunks1 = await sendTurn(ws, jobText, 180_000);
  const s1 = summarizeChunks(chunks1);
  console.log("Chunk type sequence (first 40):", s1.types.slice(0, 40).join(", "));
  console.log("Tool-ish chunks:", s1.toolRelatedCount);
  console.log("Text preview:", s1.textPreview || "(none)");

  console.log("\n--- Turn 2: follow-up question (expect context-aware reply) ---");
  const chunks2 = await sendTurn(ws, "What should I prioritize in my cover letter for this role?", 120_000);
  const s2 = summarizeChunks(chunks2);
  console.log("Chunk type sequence (first 30):", s2.types.slice(0, 30).join(", "));
  console.log("Text preview:", s2.textPreview || "(none)");

  console.log("\n--- Turn 3: history question ---");
  const chunks3 = await sendTurn(ws, "What is my saved research history?", 120_000);
  const s3 = summarizeChunks(chunks3);
  console.log("Chunk type sequence (first 20):", s3.types.slice(0, 20).join(", "));
  console.log("Text preview:", s3.textPreview || "(none)");

  ws.close();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
