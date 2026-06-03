const http = require("http");
const WebSocket = require("ws");

const WebSocketServer = WebSocket.WebSocketServer || WebSocket.Server;
const OPEN = WebSocket.OPEN || 1;

const host = process.env.EVENT_HOST || "127.0.0.1";
const port = Number(process.env.EVENT_PORT || 1235);
const rooms = new Map();

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("okay");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket, request) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const room = url.searchParams.get("room") || "default";
  const clientId = url.searchParams.get("clientId") || "";

  if (!rooms.has(room)) {
    rooms.set(room, new Set());
  }

  const clients = rooms.get(room);
  clients.add(socket);

  socket.on("message", (data) => {
    for (const client of clients) {
        if (client !== socket && client.readyState === OPEN) {
        client.send(data);
      }
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
    if (clients.size === 0) {
      rooms.delete(room);
    }
  });

  socket.send(JSON.stringify({ type: "hello", room, clientId, peers: clients.size }));
});

server.listen(port, host, () => {
  console.log(`collab events running at ws://${host}:${port}`);
});
