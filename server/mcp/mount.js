const crypto = require("crypto");
const express = require("express");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createGameMcpServer } = require("./server");
const { createRateLimiter } = require("./limits");

function secretsMatch(given, expected) {
  const a = crypto.createHash("sha256").update(String(given), "utf8").digest();
  const b = crypto.createHash("sha256").update(String(expected), "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function bearer(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function jsonError(res, status, error, message) {
  const body = { error };
  if (message) body.message = message;
  res.status(status).json(body);
}

/**
 * Mount provisioning and the stateless Streamable HTTP MCP endpoint.
 * Gameplay auth is the agent bearer token. Provisioning uses a separate secret.
 * Neither value is written to logs.
 */
function mountMcp(app, options) {
  const room = options.room;
  const provisionSecret = String(options.provisionSecret || "");
  const toolLimiter = createRateLimiter({
    limit: Number(options.toolRateLimit) || 40,
    windowMs: Number(options.toolRateWindowMs) || 10000,
  });
  const provisionLimiter = createRateLimiter({
    limit: Number(options.provisionRateLimit) || 10,
    windowMs: Number(options.provisionRateWindowMs) || 60000,
  });
  const json = express.json({ limit: "8kb" });

  app.post("/api/mcp/agents", json, (req, res) => {
    if (!provisionSecret) {
      return jsonError(res, 503, "PROVISION_DISABLED", "MCP provisioning is not configured");
    }
    const presented = bearer(req);
    if (!presented || !secretsMatch(presented, provisionSecret)) {
      return jsonError(res, 401, "BAD_CREDENTIAL");
    }
    if (!provisionLimiter.allow("provision")) {
      return jsonError(res, 429, "RATE_LIMIT");
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return jsonError(res, 400, "BAD_REQUEST", "JSON object required");
    }
    const unknown = Object.keys(req.body).filter((key) => key !== "name");
    if (unknown.length) {
      return jsonError(res, 400, "BAD_REQUEST", "only name is accepted");
    }
    try {
      const created = room.joinAgent({ name: req.body.name });
      return res.status(201).json({
        agentId: created.player.id,
        seatId: created.player.seatId,
        name: created.player.name,
        token: created.token,
        mcpPath: "/mcp",
      });
    } catch (err) {
      return jsonError(res, 400, err.code || "FAILED", err.message);
    }
  });

  app.post("/mcp", json, async (req, res) => {
    let player;
    try {
      player = room.requireMcpPlayer(bearer(req));
    } catch (err) {
      const code = err.code || "BAD_CREDENTIAL";
      return jsonError(res, 401, code);
    }
    if (!toolLimiter.allow(player.id)) {
      return jsonError(res, 429, "RATE_LIMIT");
    }
    const server = createGameMcpServer(room, player.id);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  function methodNotAllowed(_req, res) {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  }

  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);
}

module.exports = { mountMcp, secretsMatch };
