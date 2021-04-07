import express from "express";
import http from "http";
import url from "url";
import protoo from "protoo-server";
import mediasoup from "mediasoup";
import { AwaitQueue } from "awaitqueue";
import { Router, Worker } from "mediasoup/lib/types";

import { config } from "./config";

const Room = require("./lib/Room");

//const server = http.createServer(app);
let httpServer: http.Server;
let expressApp: any;
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

  // Log rooms status every X seconds.
  setInterval(() => {
    for (const room of rooms.values()) {
      room.logStatus();
    }
  }, 120000);
}

/**
 * Launch as many mediasoup Workers as given in the configuration file.
 */
async function runMediasoupWorkers() {
  const { numWorkers } = config.mediasoup;

  console.log("running %d mediasoup Workers...", numWorkers);

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
}

async function createExpressApp() {
  console.log("creating Express app...");
  const expressApp = express();
  expressApp.use(express.json());

  /**
   * For every API request, verify that the roomId in the path matches and
   * existing room.
   */
  expressApp.param("roomId", (req: any, res, next, roomId) => {
    // The room must exist for all API requests.
    if (!rooms.has(roomId)) {
      const error = new Error(`room with id "${roomId}" not found`);

      res.status(404);
      next(error);
    }

    req.room = rooms.get(roomId);

    next();
  });

  /**
   * API GET resource that returns the mediasoup Router RTP capabilities of
   * the room.
   */
  expressApp.get("/rooms/:roomId", (req: any, res) => {
    const data = req.room.getRouterRtpCapabilities();

    res.status(200).json(data);
  });

  /**
   * POST API to create a Broadcaster.
   */
  expressApp.post(
    "/rooms/:roomId/broadcasters",
    async (req: any, res, next) => {
      const { id, displayName, device, rtpCapabilities } = req.body;

      try {
        const data = await req.room.createBroadcaster({
          id,
          displayName,
          device,
          rtpCapabilities,
        });

        res.status(200).json(data);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE API to delete a Broadcaster.
   */
  expressApp.delete(
    "/rooms/:roomId/broadcasters/:broadcasterId",
    (req: any, res) => {
      const { broadcasterId } = req.params;

      req.room.deleteBroadcaster({ broadcasterId });

      res.status(200).send("broadcaster deleted");
    }
  );

  /**
   * POST API to create a mediasoup Transport associated to a Broadcaster.
   * It can be a PlainTransport or a WebRtcTransport depending on the
   * type parameters in the body. There are also additional parameters for
   * PlainTransport.
   */
  expressApp.post(
    "/rooms/:roomId/broadcasters/:broadcasterId/transports",
    async (req: any, res, next) => {
      const { broadcasterId } = req.params;
      const { type, rtcpMux, comedia, sctpCapabilities } = req.body;

      try {
        const data = await req.room.createBroadcasterTransport({
          broadcasterId,
          type,
          rtcpMux,
          comedia,
          sctpCapabilities,
        });

        res.status(200).json(data);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST API to connect a Transport belonging to a Broadcaster. Not needed
   * for PlainTransport if it was created with comedia option set to true.
   */
  expressApp.post(
    "/rooms/:roomId/broadcasters/:broadcasterId/transports/:transportId/connect",
    async (req: any, res, next) => {
      const { broadcasterId, transportId } = req.params;
      const { dtlsParameters } = req.body;

      try {
        const data = await req.room.connectBroadcasterTransport({
          broadcasterId,
          transportId,
          dtlsParameters,
        });

        res.status(200).json(data);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST API to create a mediasoup Producer associated to a Broadcaster.
   * The exact Transport in which the Producer must be created is signaled in
   * the URL path. Body parameters include kind and rtpParameters of the
   * Producer.
   */
  expressApp.post(
    "/rooms/:roomId/broadcasters/:broadcasterId/transports/:transportId/producers",
    async (req: any, res, next) => {
      const { broadcasterId, transportId } = req.params;
      const { kind, rtpParameters } = req.body;

      try {
        const data = await req.room.createBroadcasterProducer({
          broadcasterId,
          transportId,
          kind,
          rtpParameters,
        });

        res.status(200).json(data);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST API to create a mediasoup Consumer associated to a Broadcaster.
   * The exact Transport in which the Consumer must be created is signaled in
   * the URL path. Query parameters must include the desired producerId to
   * consume.
   */
  expressApp.post(
    "/rooms/:roomId/broadcasters/:broadcasterId/transports/:transportId/consume",
    async (req: any, res, next) => {
      const { broadcasterId, transportId } = req.params;
      const { producerId } = req.query;

      try {
        const data = await req.room.createBroadcasterConsumer({
          broadcasterId,
          transportId,
          producerId,
        });

        res.status(200).json(data);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST API to create a mediasoup DataConsumer associated to a Broadcaster.
   * The exact Transport in which the DataConsumer must be created is signaled in
   * the URL path. Query body must include the desired producerId to
   * consume.
   */
  expressApp.post(
    "/rooms/:roomId/broadcasters/:broadcasterId/transports/:transportId/consume/data",
    async (req: any, res, next) => {
      const { broadcasterId, transportId } = req.params;
      const { dataProducerId } = req.body;

      try {
        const data = await req.room.createBroadcasterDataConsumer({
          broadcasterId,
          transportId,
          dataProducerId,
        });

        res.status(200).json(data);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST API to create a mediasoup DataProducer associated to a Broadcaster.
   * The exact Transport in which the DataProducer must be created is signaled in
   */
  expressApp.post(
    "/rooms/:roomId/broadcasters/:broadcasterId/transports/:transportId/produce/data",
    async (req: any, res, next) => {
      const { broadcasterId, transportId } = req.params;
      const { label, protocol, sctpStreamParameters, appData } = req.body;

      try {
        const data = await req.room.createBroadcasterDataProducer({
          broadcasterId,
          transportId,
          label,
          protocol,
          sctpStreamParameters,
          appData,
        });

        res.status(200).json(data);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Error handler.
   */
  expressApp.use((error: any, req: any, res: any, next: any) => {
    if (error) {
      console.log("Express app %s", String(error));

      error.status = error.status || (error.name === "TypeError" ? 400 : 500);

      res.statusMessage = error.message;
      res.status(error.status).send(String(error));
    } else {
      next();
    }
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

  httpServer = http.createServer(expressApp);

  await new Promise((resolve) => {
    httpServer.listen(Number(config.http.listenPort), () => {
      resolve;
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

/* const PORT = process.env.PORT || 5000;

try {
  server.listen(PORT, () => {
    console.log(`Server is up at ${PORT}`);
  });
} catch (err) {
  console.log(err);
} */
