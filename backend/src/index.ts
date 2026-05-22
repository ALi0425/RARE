import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

import projectRoutes from "./routes/projects";
import assetRoutes from "./routes/assets";
import edgeRoutes from "./routes/edges";
import parseRoutes from "./routes/parse";
import commitRoutes from "./routes/commits";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/projects", projectRoutes);
app.use("/api/projects", assetRoutes);
app.use("/api/edges", edgeRoutes);
app.use("/api/parse", parseRoutes);
app.use("/api/commits", commitRoutes);

// WebSocket for task status
const clients = new Map<string, Set<import("ws").WebSocket>>();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const taskId = url.searchParams.get("taskId");

  if (taskId) {
    if (!clients.has(taskId)) clients.set(taskId, new Set());
    clients.get(taskId)!.add(ws);

    ws.on("close", () => {
      clients.get(taskId)?.delete(ws);
      if (clients.get(taskId)?.size === 0) clients.delete(taskId);
    });
  }

  ws.send(JSON.stringify({ type: "connected" }));
});

// Broadcast function for WebSocket
export function sendTaskUpdate(taskId: string, data: unknown) {
  const message = JSON.stringify(data);
  clients.get(taskId)?.forEach(ws => {
    if (ws.readyState === ws.OPEN) ws.send(message);
  });
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = parseInt(process.env.PORT || "3001", 10);
server.listen(PORT, () => {
  console.log(`RARE backend running on http://localhost:${PORT}`);
  console.log(`WebSocket server on ws://localhost:${PORT}/ws`);
});

export default app;
