#!/usr/bin/env node
// n8n MCP HTTP transport bridge for Claude Code
// Reads JSON-RPC lines from stdin, POSTs to n8n MCP HTTP endpoint, writes SSE to stdout

const N8N_MCP_URL = "http://localhost:5678/mcp-server/http";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxYjdmMjZkZi0wZGI5LTRmNGUtYjQ2Zi01NjA1MGFlNDdjODAiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImI2ODRlZTlkLWFjYTYtNDg0NC1iNTU3LTY5YTYxZTJmMDM3MCIsImlhdCI6MTc3OTc3NjYyN30.u1g1wR5JfLw5MBR5UZJPsJ_EHqiazlAYACoBjLYwv1w";

async function handleRequest(body) {
  const response = await fetch(N8N_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json, text/event-stream",
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    return JSON.stringify({
      jsonrpc: "2.0",
      id: (() => { try { return JSON.parse(body).id; } catch { return null; } })(),
      error: { code: response.status, message: errText.substring(0, 500) },
    }) + "\n";
  }

  const text = await response.text();
  return text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6) + "\n").join("");
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString().trim();
  if (!input) return;

  for (const line of input.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    process.stdout.write(await handleRequest(t));
  }
}

main().catch((err) => {
  process.stderr.write("MCP bridge error: " + err + "\n");
  process.exit(1);
});
