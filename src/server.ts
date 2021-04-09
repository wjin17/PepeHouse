import express from "express";
import http from "http";
import url from "url";
import protoo from "protoo-server";
import * as mediasoup from "mediasoup";
import { AwaitQueue } from "awaitqueue";
import path from "path";
//import { Router, Worker } from "mediasoup/lib/types";

import { config } from "./config";

import { Room } from "./lib/Room";

//const server = http.createServer(app);
let httpServer: http.Server;
let app: any;
let protooWebSocketServer: protoo.WebSocketServer;

const queue = new AwaitQueue();
const rooms = new Map();
const mediasoupWorkers: any[] = [];
let nextMediasoupWorkerIdx = 0;

async function run() {
  // Run a mediasoup Worker.
  await runMediasoupWorkers();

  // Create Express app.
  await createExpressApp();

  // Run HTTPS server.
  await runHttpsServer();

  // Run a protoo WebSocketServer.
  await runProtooWebSocketServer();

  /* // Log rooms status every X seconds.
  setInterval(() => {
    for (const room of rooms.values()) {
      room.logStatus();
    }
  }, 120000); */
}

/**
 * Launch as many mediasoup Workers as given in the configuration file.
 */
async function runMediasoupWorkers() {
  try {
    const { numWorkers } = config.mediasoup;

    console.log("running %d mediasoup workers...", numWorkers);

    for (let i = 0; i < numWorkers; ++i) {
      const worker = await mediasoup.createWorker({
        logLevel: config.mediasoup.workerSettings.logLevel,
        logTags: config.mediasoup.workerSettings.logTags,
        rtcMinPort: Number(config.mediasoup.workerSettings.rtcMinPort),
        rtcMaxPort: Number(config.mediasoup.workerSettings.rtcMaxPort),
      });

      worker.on("died", () => {
        console.log(
          "mediasoup Worker died, exiting  in 2 seconds... [pid:%d]",
          worker.pid
        );

        setTimeout(() => process.exit(1), 2000);
      });

      mediasoupWorkers.push(worker);

      // Log worker resource usage every X seconds.
      setInterval(async () => {
        const usage = await worker.getResourceUsage();

        console.log(
          "mediasoup Worker resource usage [pid:%d]: %o",
          worker.pid,
          usage
        );
      }, 120000);
    }
  } catch (err) {
    console.log(err);
  }
}

async function createExpressApp() {
  console.log("creating express app");
  app = express();
  app.use(express.json());

  /**
   * For every API request, verify that the roomId in the path matches and
   * existing room.
   */

  /**
   * API GET resource that returns the mediasoup Router RTP capabilities of
   * the room.
   */
  app.use(express.static(path.join(__dirname, "client")));

  app.get("/*", (req: express.Request, res: express.Response) => {
    res.sendFile(path.join(__dirname, "client", "index.html"));
  });
}

async function runHttpsServer() {
  console.log("running an HTTP server...");

  // HTTPS server for the protoo WebSocket server.
  /* const tls =
	{
		cert : fs.readFileSync(config.https.tls.cert),
		key  : fs.readFileSync(config.https.tls.key)
	}; */

  httpServer = http.createServer(app);

  await new Promise((resolve) => {
    httpServer.listen(Number(config.http.listenPort), () => {
      console.log(`http server listening on port: ${config.http.listenPort}`);
      resolve(null);
    });
  });
}

async function runProtooWebSocketServer() {
  console.log("running protoo WebSocketServer...");

  // Create the protoo WebSocket server.
  protooWebSocketServer = new protoo.WebSocketServer(httpServer, {
    maxReceivedFrameSize: 960000, // 960 KBytes.
    maxReceivedMessageSize: 960000,
    fragmentOutgoingMessages: true,
    fragmentationThreshold: 960000,
  });

  // Handle connections from clients.
  protooWebSocketServer.on("connectionrequest", (info: any, accept, reject) => {
    console.log("connection to websocket requested");
    // The client indicates the roomId and peerId in the URL query.
    const u = url.parse(info.request.url, true);
    const roomId = u.query["roomId"];
    const peerId = u.query["peerId"];

    if (!roomId || !peerId) {
      reject(400, "Connection request without roomId and/or peerId");

      return;
    }

    console.log(
      "protoo connection request [roomId:%s, peerId:%s, address:%s, origin:%s]",
      roomId,
      peerId,
      info.socket.remoteAddress,
      info.origin
    );

    // Serialize this code into the queue to avoid that two peers connecting at
    // the same time with the same roomId create two separate rooms with same
    // roomId.
    queue
      .push(async () => {
        // @ts-ignore
        const room = await getOrCreateRoom({ roomId });

        // Accept the protoo WebSocket connection.
        const protooWebSocketTransport = accept();

        room.handleProtooConnection({ peerId, protooWebSocketTransport });
      })
      .catch((error) => {
        console.log("room creation or room joining failed:%o", error);

        reject(error);
      });
  });
}

/**
 * Get next mediasoup Worker.
 */
function getMediasoupWorker() {
  const worker = mediasoupWorkers[nextMediasoupWorkerIdx];

  if (++nextMediasoupWorkerIdx === mediasoupWorkers.length)
    nextMediasoupWorkerIdx = 0;

  return worker;
}

/**
 * Get a Room instance (or create one if it does not exist).
 */
async function getOrCreateRoom({ roomId }: { roomId: string }) {
  let room = rooms.get(roomId);

  // If the Room does not exist create a new one.
  if (!room) {
    console.log("creating a new Room [roomId:%s]", roomId);

    const mediasoupWorker = getMediasoupWorker();

    room = await Room.create({ mediasoupWorker, roomId });

    rooms.set(roomId, room);
    room.on("close", () => rooms.delete(roomId));
  }

  return room;
}

run();

/* const PORT = process.env.PORT || 5000;

try {
  server.listen(PORT, () => {
    console.log(`Server is up at ${PORT}`);
  });
} catch (err) {
  console.log(err);
} */
