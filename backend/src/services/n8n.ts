import type { ParseResult } from "../types";

const N8N_URL = process.env.N8N_URL || "http://localhost:5678";
const N8N_WEBHOOK_PATH = process.env.N8N_WEBHOOK_PATH || "asset-ingestion";
const N8N_TIMEOUT = parseInt(process.env.N8N_TIMEOUT || "5000", 10);

export async function callN8nParser(text: string): Promise<ParseResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), N8N_TIMEOUT);

    const response = await fetch(`${N8N_URL}/webhook/${N8N_WEBHOOK_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`n8n webhook error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // n8n returns various formats, normalize to ParseResult
    return normalizeN8nResponse(data);
  } catch (err) {
    console.warn("n8n parse failed:", err);
    return null;
  }
}

function normalizeN8nResponse(data: any): ParseResult {
  // Direct format: { entities: [...], edges: [...] }
  if (data.entities || data.edges) {
    return {
      entities: data.entities || [],
      edges: data.edges || [],
    };
  }

  // n8n workflow format with modules/pages/fields/actions
  if (data.success || data.modules || data.pages) {
    const entities: ParseResult["entities"] = [];

    // Try to extract from node-based format
    if (data.nodes) {
      for (const node of data.nodes) {
        if (node.type === "module" || node.nodeType === "module") {
          entities.push({ name: node.name || node.label, type: "module" });
        }
        if (node.type === "page" || node.nodeType === "page") {
          entities.push({
            name: node.name || node.label,
            type: "page",
            parentName: node.parentName || node.parent || node.moduleId || undefined,
          });
        }
      }
    }

    // Try to extract from summary counts
    if (data.modules > 0 && entities.length === 0) {
      // Need to use the raw text as fallback
      return { entities: [], edges: [] };
    }

    // Extract edges if present in node format
    const edges: ParseResult["edges"] = [];
    if (data.edges) {
      for (const e of data.edges) {
        edges.push({
          sourceName: e.from || e.source || e.sourceName || "",
          targetName: e.to || e.target || e.targetName || "",
          sourceType: e.sourceType || "page",
          targetType: e.targetType || "page",
          flowType: e.flowType || "BUSINESS_FLOW",
          status: e.status || "extracted",
          label: e.label || "",
          sourceQuote: e.sourceQuote || e.quote || "",
        });
      }
    }

    return { entities, edges };
  }

  return { entities: [], edges: [] };
}
