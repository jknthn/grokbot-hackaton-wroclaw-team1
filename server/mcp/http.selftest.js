const assert = require("assert");
const fs = require("fs");
const { io } = require("socket.io-client");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { createGameServer } = require("../index");
const { TOOL_NAMES } = require("./server");

const PROVISION_SECRET = "test-provision-secret";

async function emitUntil(socket, emitFn, predicate, attempts = 5) {
  const pending = nextNotice(socket);
  emitFn();
  let notice = await pending;
  for (let i = 0; i < attempts; i += 1) {
    if (notice.type === "error") return notice;
    if (predicate(notice.payload.view)) return notice;
    notice = await nextNotice(socket);
  }
  return notice;
}

function nextNotice(socket, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for socket state or error"));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      socket.off("state", onState);
      socket.off("error_msg", onError);
    }
    function onState(payload) {
      cleanup();
      resolve({ type: "state", payload });
    }
    function onError(payload) {
      cleanup();
      resolve({ type: "error", payload });
    }
    socket.on("state", onState);
    socket.on("error_msg", onError);
  });
}

function ack(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res));
  });
}

async function connectSocket(base) {
  const socket = io(base, { transports: ["websocket"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 4000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return socket;
}

async function connectAgent(base, token) {
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "mcp-selftest", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args || {} });
  const text = (result.content || []).map((part) => part.text || "").join("");
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { isError: Boolean(result.isError), body };
}

async function provision(base, name, extra = {}) {
  const res = await fetch(`${base}/api/mcp/agents`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${PROVISION_SECRET}`,
    },
    body: JSON.stringify({ name, ...extra }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  const game = createGameServer({
    PORT: "0",
    HOST: "127.0.0.1",
    JOIN_PIN: "4821",
    AGENT_TRANSPORT: "mcp",
    GM_AUTO: "0",
    RULES: "town",
    MCP_PROVISION_SECRET: PROVISION_SECRET,
    MCP_TOOL_RATE_LIMIT: "200",
  });
  const address = await game.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const clients = [];
  let human = null;
  try {
    const page = await fetch(`${base}/`);
    assert.strictEqual(page.status, 200);
    assert.ok((await page.text()).includes("THE CLUB"));
    const streamPage = await fetch(`${base}/stream`);
    assert.strictEqual(streamPage.status, 200);

    const missing = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.strictEqual(missing.status, 401);
    const missingBody = await missing.json();
    assert.strictEqual(missingBody.error, "NO_CREDENTIAL");

    const wrong = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer not-a-real-token",
      },
      body: "{}",
    });
    assert.strictEqual(wrong.status, 401);
    assert.strictEqual((await wrong.json()).error, "BAD_CREDENTIAL");

    const secretAsAgent = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${PROVISION_SECRET}`,
      },
      body: "{}",
    });
    assert.strictEqual(secretAsAgent.status, 401);

    const noProvision = await fetch(`${base}/api/mcp/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    assert.strictEqual(noProvision.status, 401);

    human = await connectSocket(base);
    const badPin = await ack(human, "join", { name: "Sam", pin: "0000" });
    assert.strictEqual(badPin.ok, false);
    assert.strictEqual(badPin.error, "BAD_PIN");

    const joined = await ack(human, "join", { name: "Sam", pin: "4821" });
    assert.strictEqual(joined.ok, true);
    assert.ok(joined.token);
    const humanToken = joined.token;

    const browserOnMcp = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${humanToken}`,
      },
      body: "{}",
    });
    assert.strictEqual(browserOnMcp.status, 401);
    assert.strictEqual((await browserOnMcp.json()).error, "AGENT_CHANNEL");

    const earlyStart = nextNotice(human);
    human.emit("startGame");
    const early = await earlyStart;
    assert.strictEqual(early.type, "error");
    assert.strictEqual(early.payload.error, "NEED_TABLE");

    const privileged = await provision(base, "Ada", { host: true, kind: "bot" });
    assert.strictEqual(privileged.status, 400);

    const ada = await provision(base, "Ada");
    const bea = await provision(base, "Bea");
    assert.strictEqual(ada.status, 201);
    assert.strictEqual(bea.status, 201);
    assert.notStrictEqual(ada.body.token, bea.body.token);
    assert.notStrictEqual(ada.body.agentId, bea.body.agentId);
    assert.strictEqual(game.room.players.get(ada.body.agentId).access, "mcp");
    assert.strictEqual(game.room.players.get(ada.body.agentId).host, false);
    assert.strictEqual(game.room.players.get(joined.playerId).host, true);
    assert.strictEqual(game.room.players.size, 3);

    const addBot = nextNotice(human);
    human.emit("addBot", {});
    const addBotResult = await addBot;
    assert.strictEqual(addBotResult.type, "error");
    assert.strictEqual(addBotResult.payload.error, "MCP_ONLY");
    assert.strictEqual(game.room.players.size, 3);

    const agentA = await connectAgent(base, ada.body.token);
    const agentB = await connectAgent(base, bea.body.token);
    clients.push(agentA, agentB);

    const listed = await agentA.client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    assert.deepStrictEqual(names, [...TOOL_NAMES].sort());
    fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
    fs.writeFileSync(
      "/opt/cursor/artifacts/mcp-tools.json",
      JSON.stringify(
        listed.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema || null,
        })),
        null,
        2
      )
    );

    const sessionA = await callTool(agentA.client, "game_session");
    const sessionB = await callTool(agentB.client, "game_session");
    assert.strictEqual(sessionA.isError, false);
    assert.strictEqual(sessionA.body.agentId, ada.body.agentId);
    assert.strictEqual(sessionB.body.agentId, bea.body.agentId);
    assert.notStrictEqual(sessionA.body.seatId, sessionB.body.seatId);
    assert.strictEqual(sessionA.body.access, "mcp");
    assert.ok(!JSON.stringify(sessionA.body).includes(ada.body.token));

    const before = await callTool(agentA.client, "game_state");
    assert.strictEqual(before.body.state.phase, "lobby");
    assert.strictEqual(before.body.state.you.kind, "bot");
    assert.strictEqual(before.body.state.you.host, false);
    assert.strictEqual(before.body.state.seats.length, 3);
    assert.ok(before.body.state.seats.every((seat) => !("kind" in seat)));
    assert.ok(!JSON.stringify(before.body).includes(bea.body.token));
    assert.ok(!JSON.stringify(before.body).includes(humanToken));
    assert.ok(!JSON.stringify(before.body).includes(bea.body.agentId));

    const started = nextNotice(human);
    human.emit("startGame");
    const startNotice = await started;
    assert.strictEqual(startNotice.type, "state");
    assert.strictEqual(startNotice.payload.view.phase, "talk");
    assert.strictEqual(startNotice.payload.view.you.kind, "human");
    assert.strictEqual(startNotice.payload.view.you.host, true);
    assert.ok(startNotice.payload.view.seats.every((seat) => !("kind" in seat)));

    const late = await provision(base, "Late");
    assert.strictEqual(late.status, 400);
    assert.strictEqual(late.body.error, "LOBBY_CLOSED");

    const talk = await callTool(agentA.client, "game_state", { sinceVersion: 0 });
    assert.strictEqual(talk.body.changed, true);
    assert.strictEqual(talk.body.state.phase, "talk");
    assert.ok(talk.body.state.you.persona);
    assert.ok(!talk.body.state.channels.shadow);
    const unchanged = await callTool(agentA.client, "game_state", {
      sinceVersion: talk.body.state.version,
    });
    assert.strictEqual(unchanged.body.changed, false);

    const publicSay = await callTool(agentA.client, "game_say", {
      channel: "public",
      text: "I should not be able to free-chat",
    });
    assert.strictEqual(publicSay.isError, true);
    assert.strictEqual(publicSay.body.error, "FORBIDDEN");

    const ready = await callTool(agentA.client, "game_act", { type: "ready" });
    assert.strictEqual(ready.isError, true);
    assert.strictEqual(ready.body.error, "FORBIDDEN");
    const blockEarly = await callTool(agentA.client, "game_act", { type: "blockNight" });
    assert.strictEqual(blockEarly.isError, true);
    assert.strictEqual(blockEarly.body.error, "FORBIDDEN");

    const earlySubmit = await callTool(agentA.client, "game_submit", { text: "too soon" });
    assert.strictEqual(earlySubmit.isError, true);
    assert.strictEqual(earlySubmit.body.error, "NO_WINDOW");

    let hostActionRejected = false;
    try {
      const hostAction = await agentA.client.callTool({
        name: "game_act",
        arguments: { type: "setPhase", phase: "night" },
      });
      hostActionRejected = Boolean(hostAction.isError);
    } catch {
      hostActionRejected = true;
    }
    assert.strictEqual(hostActionRejected, true);

    let longTextRejected = false;
    try {
      const longText = await callTool(agentA.client, "game_say", {
        channel: "shadow",
        text: "x".repeat(400),
      });
      longTextRejected = Boolean(longText.isError);
    } catch {
      longTextRejected = true;
    }
    assert.strictEqual(longTextRejected, true);

    let hugeWaitRejected = false;
    try {
      const hugeWait = await callTool(agentA.client, "game_wait", {
        sinceVersion: talk.body.state.version,
        timeoutMs: 999999,
      });
      hugeWaitRejected = Boolean(hugeWait.isError);
    } catch {
      hugeWaitRejected = true;
    }
    assert.strictEqual(hugeWaitRejected, true);

    const opened = nextNotice(human);
    human.emit("openWindow", { maxLen: 120 });
    const openNotice = await opened;
    assert.strictEqual(openNotice.type, "state");
    assert.strictEqual(openNotice.payload.view.window.open, true);

    const submitA = await callTool(agentA.client, "game_submit", { text: "Ada keeps the well covered." });
    const submitB = await callTool(agentB.client, "game_submit", { text: "Bea counts the lanterns." });
    assert.strictEqual(submitA.isError, false);
    assert.strictEqual(submitA.body.state.window.youSubmitted, true);
    assert.strictEqual(submitB.body.state.window.youSubmitted, true);
    const again = await callTool(agentA.client, "game_submit", { text: "second line" });
    assert.strictEqual(again.isError, true);
    assert.strictEqual(again.body.error, "ALREADY_SUBMITTED");

    const humanSubmitted = await emitUntil(
      human,
      () => human.emit("submit", { text: "Sam rations the water." }),
      (view) => view.window && view.window.youSubmitted
    );
    assert.strictEqual(humanSubmitted.type, "state");
    assert.strictEqual(humanSubmitted.payload.view.window.youSubmitted, true);

    const closed = nextNotice(human);
    human.emit("closeWindow", { reveal: true });
    const closeNotice = await closed;
    assert.strictEqual(closeNotice.type, "state");
    assert.strictEqual(closeNotice.payload.view.window, null);
    const revealed = closeNotice.payload.view.channels.public.map((message) => message.text).join("\n");
    assert.ok(revealed.includes("Sam rations the water."));
    assert.ok(revealed.includes("Ada keeps the well covered."));

    const versionBeforeVote = (await callTool(agentB.client, "game_state")).body.state.version;
    const waitPromise = callTool(agentB.client, "game_wait", {
      sinceVersion: versionBeforeVote,
      timeoutMs: 3000,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const overlap = await callTool(agentB.client, "game_wait", {
      sinceVersion: versionBeforeVote,
      timeoutMs: 200,
    });
    assert.strictEqual(overlap.isError, true);
    assert.strictEqual(overlap.body.error, "WAIT_IN_PROGRESS");
    human.emit("setPhase", { phase: "vote" });
    const waited = await waitPromise;
    assert.strictEqual(waited.isError, false);
    assert.strictEqual(waited.body.timedOut, false);
    assert.strictEqual(waited.body.state.phase, "vote");
    assert.ok(waited.body.state.allowed.act.includes("vote"));
    assert.ok(waited.body.version > versionBeforeVote);

    const caughtUp = await callTool(agentA.client, "game_wait", { sinceVersion: 0, timeoutMs: 50 });
    assert.strictEqual(caughtUp.body.timedOut, false);
    assert.strictEqual(caughtUp.body.state.phase, "vote");

    const humanSeat = startNotice.payload.view.you.seatId;
    const badTarget = await callTool(agentA.client, "game_act", { type: "vote", seatId: 30 });
    assert.strictEqual(badTarget.isError, true);
    assert.strictEqual(badTarget.body.error, "ACT_FAILED");

    const impersonated = await callTool(agentA.client, "game_act", {
      type: "vote",
      seatId: humanSeat,
      playerId: bea.body.agentId,
    });
    assert.strictEqual(impersonated.isError, true);
    assert.strictEqual(impersonated.body.error, "IMPERSONATION");
    const beaStill = await callTool(agentB.client, "game_state");
    assert.strictEqual(beaStill.body.state.meta.youVoted, false);
    const adaStill = await callTool(agentA.client, "game_state");
    assert.strictEqual(adaStill.body.state.meta.youVoted, false);

    const adaVote = await callTool(agentA.client, "game_act", { type: "vote", seatId: humanSeat });
    const beaVote = await callTool(agentB.client, "game_act", {
      type: "vote",
      seatId: adaVote.body.state.you.seatId,
    });
    assert.strictEqual(adaVote.isError, false);
    assert.strictEqual(beaVote.isError, false);
    assert.strictEqual(adaVote.body.state.meta.youVoted, true);
    assert.strictEqual(beaVote.body.state.meta.youVoted, true);

    const humanVoted = await emitUntil(
      human,
      () => human.emit("act", { type: "vote", payload: { seatId: beaVote.body.state.you.seatId } }),
      (view) => view.meta && view.meta.youVoted === true
    );
    assert.strictEqual(humanVoted.type, "state");
    assert.strictEqual(humanVoted.payload.view.meta.youVoted, true);

    const nightNotice = await emitUntil(
      human,
      () => human.emit("setPhase", { phase: "night" }),
      (view) => view.phase === "night"
    );
    assert.strictEqual(nightNotice.type, "state");
    assert.strictEqual(nightNotice.payload.view.phase, "night");
    assert.ok(!nightNotice.payload.view.channels.shadow);

    const shadowSay = await callTool(agentA.client, "game_say", {
      channel: "shadow",
      text: "meet by the north lamp and do not share seats",
    });
    assert.strictEqual(shadowSay.isError, false);
    assert.ok(shadowSay.body.state.channels.shadow.some((message) => message.text.includes("north lamp")));
    assert.ok(shadowSay.body.state.channels.shadow.every((message) => !("fromSeat" in message)));
    const seenByBea = await callTool(agentB.client, "game_state");
    assert.ok(seenByBea.body.state.channels.shadow.some((message) => message.text.includes("north lamp")));
    assert.notStrictEqual(shadowSay.body.state.you.shadowLabel, seenByBea.body.state.you.shadowLabel);
    assert.ok(!JSON.stringify(seenByBea.body).includes(ada.body.agentId));

    const humanShadow = await emitUntil(
      human,
      () => human.emit("say", { channel: "shadow", text: "humans cannot hear this" }),
      () => false
    );
    assert.strictEqual(humanShadow.type, "error");
    assert.strictEqual(humanShadow.payload.error, "FORBIDDEN");
    const humanAfter = await callTool(agentA.client, "game_state");
    assert.ok(!JSON.stringify(humanAfter.body).includes("humans cannot hear this") || humanAfter.body.state.channels.shadow.every((message) => !message.text.includes("humans cannot hear this")));
    const humanView = game.room.viewFor(joined.playerId);
    assert.ok(!JSON.stringify(humanView).includes("north lamp"));

    const humanStrikeResult = await emitUntil(
      human,
      () => human.emit("act", { type: "shadowVote", payload: { seatId: adaVote.body.state.you.seatId } }),
      () => false
    );
    assert.strictEqual(humanStrikeResult.type, "error");
    assert.strictEqual(humanStrikeResult.payload.error, "FORBIDDEN");

    game.room.setNightStage("vote");
    const strikeState = await callTool(agentA.client, "game_state");
    assert.ok(strikeState.body.state.allowed.act.includes("shadowVote"));
    assert.ok(Array.isArray(strikeState.body.state.meta.humanTargets));
    assert.ok(strikeState.body.state.meta.humanTargets.some((target) => target.seatId === humanSeat));
    const dayStrike = await callTool(agentB.client, "game_act", { type: "shadowVote", seatId: 30 });
    assert.strictEqual(dayStrike.isError, true);

    const pass = await callTool(agentA.client, "game_act", { type: "shadowVote", pass: true });
    const strike = await callTool(agentB.client, "game_act", { type: "shadowVote", seatId: humanSeat });
    assert.strictEqual(pass.isError, false);
    assert.strictEqual(strike.isError, false);
    assert.strictEqual(pass.body.state.meta.youShadowVoted, true);
    assert.strictEqual(strike.body.state.meta.youShadowVoted, true);
    const agentBlock = await callTool(agentA.client, "game_act", { type: "blockNight" });
    assert.strictEqual(agentBlock.isError, true);
    assert.strictEqual(agentBlock.body.error, "FORBIDDEN");

    await agentA.client.close();
    const reconnected = await connectAgent(base, ada.body.token);
    clients[0] = reconnected;
    const resumed = await callTool(reconnected.client, "game_reconnect");
    assert.strictEqual(resumed.isError, false);
    assert.strictEqual(resumed.body.reconnected, true);
    assert.strictEqual(resumed.body.seatId, pass.body.state.you.seatId);
    assert.strictEqual(resumed.body.agentId, ada.body.agentId);
    assert.strictEqual(resumed.body.state.you.playerId, ada.body.agentId);
    assert.ok(!JSON.stringify(resumed.body).includes(ada.body.token));

    const endNotice = await emitUntil(
      human,
      () => human.emit("setPhase", { phase: "ended" }),
      (view) => view.phase === "ended"
    );
    assert.strictEqual(endNotice.type, "state");
    assert.strictEqual(endNotice.payload.view.phase, "ended");
    const terminal = await callTool(agentB.client, "game_state");
    assert.strictEqual(terminal.body.state.terminal, true);
    assert.strictEqual(terminal.body.state.phase, "ended");

    const thief = await connectSocket(base);
    const seized = await ack(thief, "resume", { token: ada.body.token });
    assert.strictEqual(seized.ok, false);
    assert.strictEqual(seized.error, "AGENT_CHANNEL");
    const kindSpoof = await ack(thief, "join", { name: "Thief", pin: "4821", kind: "bot" });
    assert.strictEqual(kindSpoof.ok, false);
    assert.strictEqual(kindSpoof.error, "AGENT_CHANNEL");
    const tokenJoin = await ack(thief, "join", {
      name: "Thief",
      pin: "4821",
      token: bea.body.token,
    });
    assert.strictEqual(tokenJoin.ok, false);
    assert.strictEqual(tokenJoin.error, "AGENT_CHANNEL");
    assert.strictEqual(game.room.players.get(ada.body.agentId).access, "mcp");
    assert.strictEqual(game.room.players.get(bea.body.agentId).access, "mcp");
    thief.close();

    const cleared = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for room_cleared")), 4000);
      human.once("room_cleared", () => {
        clearTimeout(timer);
        resolve(true);
      });
      human.emit("resetRoom");
    });
    assert.strictEqual(cleared, true);
    const expired = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ada.body.token}`,
      },
      body: "{}",
    });
    assert.strictEqual(expired.status, 401);
    assert.strictEqual((await expired.json()).error, "SESSION_EXPIRED");
  } finally {
    for (const client of clients) {
      if (client) await client.client.close().catch(() => {});
    }
    if (human) human.close();
    await game.close();
  }

  const limited = createGameServer({
    PORT: "0",
    HOST: "127.0.0.1",
    JOIN_PIN: "4821",
    AGENT_TRANSPORT: "mcp",
    GM_AUTO: "0",
    MCP_PROVISION_SECRET: PROVISION_SECRET,
    MCP_TOOL_RATE_LIMIT: "8",
    MCP_TOOL_RATE_WINDOW_MS: "10000",
  });
  const limitedAddress = await limited.listen();
  const limitedBase = `http://127.0.0.1:${limitedAddress.port}`;
  let limitedClient = null;
  try {
    const created = await provision(limitedBase, "Rate");
    assert.strictEqual(created.status, 201);
    limitedClient = await connectAgent(limitedBase, created.body.token);
    let sawLimit = false;
    let accepted = 0;
    for (let i = 0; i < 12; i += 1) {
      try {
        const result = await callTool(limitedClient.client, "game_session");
        if (!result.isError) accepted += 1;
      } catch (err) {
        const limitedResponse = err.code === 429 || String(err.message || err).includes("RATE_LIMIT");
        if (limitedResponse) {
          sawLimit = true;
          break;
        }
        throw err;
      }
    }
    assert.ok(accepted >= 1);
    assert.strictEqual(sawLimit, true);
  } finally {
    if (limitedClient) await limitedClient.client.close().catch(() => {});
    await limited.close();
  }

  console.log("mcp.http.selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
