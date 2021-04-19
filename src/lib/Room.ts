import { EventEmitter } from "events";
import protoo from "protoo-server";
import { Transport, DataConsumer } from "mediasoup/lib/types";

import Bot from "./Bot";

import { config } from "../config";
import * as RoomTypes from "../models/room";

export class Room extends EventEmitter {
  _roomId;
  _closed;
  _protooRoom;
  _mediasoupRouter;
  _bot;
  static async create({ mediasoupWorker, roomId }: RoomTypes.CreateParams) {
    // Create a protoo Room instance.
    const protooRoom = new protoo.Room();

    // Router media codecs.
    const { mediaCodecs } = config.mediasoup.routerOptions;

    // Create a mediasoup Router.
    const mediasoupRouter = await mediasoupWorker.createRouter({ mediaCodecs });

    const bot = await Bot.create({ mediasoupRouter });

    return new Room({
      roomId,
      protooRoom,
      mediasoupRouter,
      bot,
    });
  }

  constructor({
    roomId,
    protooRoom,
    mediasoupRouter,
    bot,
  }: RoomTypes.RoomParams) {
    super();
    this.setMaxListeners(Infinity);
    this._roomId = roomId;
    this._closed = false;
    this._protooRoom = protooRoom;
    this._mediasoupRouter = mediasoupRouter;
    this._bot = bot;
  }

  close() {
    this._closed = true;
    this._protooRoom.close();
    this._mediasoupRouter.close();
    this._bot.close();
    this.emit("close");
  }

  async handleProtooConnection({
    peerId,
    protooWebSocketTransport,
  }: RoomTypes.ProtooConnectionParams) {
    const existingPeer = this._protooRoom.getPeer(peerId);

    if (existingPeer) {
      console.log(
        "handleProtooConnection() | there is already a protoo Peer with same peerId, closing it [peerId:%s]",
        peerId
      );

      existingPeer.close();
    }

    let peer: protoo.Peer;

    // Create a new protoo Peer with the given peerId.
    try {
      peer = await this._protooRoom.createPeer(
        peerId,
        protooWebSocketTransport
      );

      // Use the peer.data object to store mediasoup related objects.

      // Not joined after a custom protoo 'join' request is later received.
      peer.data.consume = true;
      peer.data.joined = false;
      peer.data.displayName = undefined;
      peer.data.device = undefined;
      peer.data.rtpCapabilities = undefined;
      peer.data.sctpCapabilities = undefined;

      // Have mediasoup related maps ready even before the Peer joins since we
      // allow creating Transports before joining.
      peer.data.transports = new Map();
      peer.data.producers = new Map();
      peer.data.consumers = new Map();
      peer.data.dataProducers = new Map();
      peer.data.dataConsumers = new Map();

      peer.on("request", (request, accept, reject) => {
        console.log(
          'protoo Peer "request" event [method:%s, peerId:%s]',
          request.method,
          peer.id
        );

        this._handleProtooRequest(peer, request, accept, reject).catch(
          (error: Error) => {
            console.log("request failed:%o", error);
            reject(error);
          }
        );
      });

      peer.on("close", () => {
        if (this._closed) return;

        console.log('protoo Peer "close" event [peerId:%s]', peer.id);

        // If the Peer was joined, notify all Peers.
        if (peer.data.joined) {
          for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
            otherPeer
              .notify("peerClosed", {
                peerId: peer.id,
                displayName: peer.data.displayName,
              })
              .catch(() => {});
          }
        }

        // Iterate and close all mediasoup Transport associated to this Peer, so all
        // its Producers and Consumers will also be closed.
        for (const transport of peer.data.transports.values()) {
          transport.close();
        }

        // If this is the latest Peer in the room, close the room.
        if (this._protooRoom.peers.length === 0) {
          console.log(
            "last Peer in the room left, closing the room [roomId:%s]",
            this._roomId
          );

          this.close();
        }
      });
    } catch (error) {
      console.log("protooRoom.createPeer() failed:%o", error);
    }
  }

  getRouterRtpCapabilities() {
    return this._mediasoupRouter.rtpCapabilities;
  }

  // TODO: add peer type
  async _handleProtooRequest(
    peer: any,
    request: protoo.ProtooRequest,
    accept: protoo.AcceptFn,
    reject: protoo.RejectFn
  ) {
    switch (request.method) {
      case "getRouterRtpCapabilities": {
        accept(this._mediasoupRouter.rtpCapabilities);
        break;
      }

      case "join": {
        // Ensure the Peer is not already joined.
        if (peer.data.joined) throw new Error("Peer already joined");

        const {
          displayName,
          device,
          rtpCapabilities,
          sctpCapabilities,
          role,
        } = request.data;

        if (role === "host") {
          const existingHost = this._getJoinedPeers().find(
            (currentPeer) =>
              currentPeer.data.role === "host" && currentPeer.id != peer.id
          );
          if (existingHost) {
            throw new Error("Host exists");
          }
        }

        // Store client data into the protoo Peer data object.
        peer.data.joined = true;
        peer.data.displayName = displayName;
        peer.data.device = device;
        peer.data.rtpCapabilities = rtpCapabilities;
        peer.data.sctpCapabilities = sctpCapabilities;
        peer.data.role = role;

        // Tell the new Peer about already joined Peers.
        // And also create Consumers for existing Producers.

        const joinedPeers = [...this._getJoinedPeers()];

        // Reply now the request with the list of joined peers (all but the new one).
        const peerInfos = joinedPeers
          .filter((joinedPeer) => joinedPeer.id !== peer.id)
          .map((joinedPeer) => ({
            id: joinedPeer.id,
            displayName: joinedPeer.data.displayName,
            device: joinedPeer.data.device,
          }));

        accept({ peers: peerInfos });

        // Mark the new Peer as joined.
        peer.data.joined = true;

        for (const joinedPeer of joinedPeers) {
          // Create Consumers for existing Producer.
          for (const producer of joinedPeer.data.producers.values()) {
            this._createConsumer({
              consumerPeer: peer,
              producerPeer: joinedPeer,
              producer,
            });
          }

          // Create DataConsumers for existing DataProducers.
          for (const dataProducer of joinedPeer.data.dataProducers.values()) {
            if (dataProducer.label === "bot") continue;

            this._createDataConsumer({
              dataConsumerPeer: peer,
              dataProducerPeer: joinedPeer,
              dataProducer,
            });
          }
        }

        // Create DataConsumers for bot DataProducer.
        this._createDataConsumer({
          dataConsumerPeer: peer,
          dataProducerPeer: null,
          dataProducer: this._bot.dataProducer,
        });

        // Notify the new Peer to all other Peers.
        for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
          otherPeer
            .notify("newPeer", {
              id: peer.id,
              displayName: peer.data.displayName,
              device: peer.data.device,
            })
            .catch(() => {});
        }

        break;
      }

      case "createWebRtcTransport": {
        // NOTE: Don't require that the Peer is joined here, so the client can
        // initiate mediasoup Transports and be ready when he later joins.

        const {
          forceTcp,
          producing,
          consuming,
          sctpCapabilities,
        } = request.data;

        const webRtcTransportOptions: RoomTypes.WebRtcTransportOptions = {
          ...config.mediasoup.webRtcTransportOptions,
          enableSctp: Boolean(sctpCapabilities),
          numSctpStreams: (sctpCapabilities || {}).numStreams,
          appData: { producing, consuming },
        };

        if (forceTcp) {
          webRtcTransportOptions.enableUdp = false;
          webRtcTransportOptions.enableTcp = true;
        }

        const transport = await this._mediasoupRouter.createWebRtcTransport(
          webRtcTransportOptions
        );

        transport.on("sctpstatechange", (sctpState: string) => {
          console.log(
            'WebRtcTransport "sctpstatechange" event [sctpState:%s]',
            sctpState
          );
        });

        transport.on("dtlsstatechange", (dtlsState: string) => {
          if (dtlsState === "failed" || dtlsState === "closed")
            console.log(
              'WebRtcTransport "dtlsstatechange" event [dtlsState:%s]',
              dtlsState
            );
        });

        // NOTE: For testing.
        // await transport.enableTraceEvent([ 'probation', 'bwe' ]);
        //await transport.enableTraceEvent(["bwe"]);

        /* transport.on("trace", (trace: any) => {
          console.log(
            'transport "trace" event [transportId:%s, trace.type:%s, trace:%o]',
            transport.id,
            trace.type,
            trace
          );

          if (trace.type === "bwe" && trace.direction === "out") {
            peer
              .notify("downlinkBwe", {
                desiredBitrate: trace.info.desiredBitrate,
                effectiveDesiredBitrate: trace.info.effectiveDesiredBitrate,
                availableBitrate: trace.info.availableBitrate,
              })
              .catch(() => {});
          }
        }); */

        // Store the WebRtcTransport into the protoo Peer data Object.
        peer.data.transports.set(transport.id, transport);

        accept({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          sctpParameters: transport.sctpParameters,
        });

        const { maxIncomingBitrate } = config.mediasoup.webRtcTransportOptions;

        // If set, apply max incoming bitrate limit.
        if (maxIncomingBitrate) {
          try {
            await transport.setMaxIncomingBitrate(maxIncomingBitrate);
          } catch (error) {}
        }

        break;
      }

      case "connectWebRtcTransport": {
        const { transportId, dtlsParameters } = request.data;
        const transport = peer.data.transports.get(transportId);
        if (!transport)
          throw new Error(`transport with id "${transportId}" not found`);

        await transport.connect({ dtlsParameters });

        accept(null);

        break;
      }

      case "restartIce": {
        const { transportId } = request.data;
        const transport = peer.data.transports.get(transportId);

        if (!transport)
          throw new Error(`transport with id "${transportId}" not found`);

        const iceParameters = await transport.restartIce();

        accept(iceParameters);

        break;
      }

      case "produce": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { transportId, kind, rtpParameters } = request.data;
        let { appData } = request.data;
        const transport = peer.data.transports.get(transportId);

        if (!transport)
          throw new Error(`transport with id "${transportId}" not found`);

        // Add peerId into appData to later get the associated Peer during
        // the 'loudest' event of the audioLevelObserver.
        appData = { ...appData, peerId: peer.id };

        const producer = await transport.produce({
          kind,
          rtpParameters,
          appData,
          // keyFrameRequestDelay: 5000
        });

        // Store the Producer into the protoo Peer data Object.
        peer.data.producers.set(producer.id, producer);

        accept({ id: producer.id });

        // Optimization: Create a server-side Consumer for each Peer.
        for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
          this._createConsumer({
            consumerPeer: otherPeer,
            producerPeer: peer,
            producer,
          });
        }

        break;
      }

      case "closeProducer": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { producerId } = request.data;
        const producer = peer.data.producers.get(producerId);

        if (!producer)
          throw new Error(`producer with id "${producerId}" not found`);

        producer.close();

        // Remove from its map.
        peer.data.producers.delete(producerId);

        // notify other peers producer closed

        /* for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
          otherPeer
            .notify("producerClosed", {
              id: peer.id,
              displayName: peer.data.displayName,
              device: peer.data.device,
            })
            .catch(() => {});
        } */

        accept(null);

        break;
      }

      case "pauseProducer": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { producerId } = request.data;
        const producer = peer.data.producers.get(producerId);

        if (!producer)
          throw new Error(`producer with id "${producerId}" not found`);

        await producer.pause();

        accept(null);

        break;
      }

      case "resumeProducer": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { producerId } = request.data;
        const producer = peer.data.producers.get(producerId);

        if (!producer)
          throw new Error(`producer with id "${producerId}" not found`);

        await producer.resume();

        accept(null);

        break;
      }

      case "pauseConsumer": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { consumerId } = request.data;
        const consumer = peer.data.consumers.get(consumerId);

        if (!consumer)
          throw new Error(`consumer with id "${consumerId}" not found`);

        await consumer.pause();

        accept(null);

        break;
      }

      case "resumeConsumer": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { consumerId } = request.data;
        const consumer = peer.data.consumers.get(consumerId);

        if (!consumer)
          throw new Error(`consumer with id "${consumerId}" not found`);

        await consumer.resume();

        accept(null);

        break;
      }

      case "setConsumerPreferredLayers": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { consumerId, spatialLayer, temporalLayer } = request.data;
        const consumer = peer.data.consumers.get(consumerId);

        if (!consumer)
          throw new Error(`consumer with id "${consumerId}" not found`);

        await consumer.setPreferredLayers({ spatialLayer, temporalLayer });

        accept(null);

        break;
      }

      case "setConsumerPriority": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { consumerId, priority } = request.data;
        const consumer = peer.data.consumers.get(consumerId);

        if (!consumer)
          throw new Error(`consumer with id "${consumerId}" not found`);

        await consumer.setPriority(priority);

        accept(null);

        break;
      }

      case "requestConsumerKeyFrame": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { consumerId } = request.data;
        const consumer = peer.data.consumers.get(consumerId);

        if (!consumer)
          throw new Error(`consumer with id "${consumerId}" not found`);

        await consumer.requestKeyFrame();

        accept(null);

        break;
      }

      case "produceData": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const {
          transportId,
          sctpStreamParameters,
          label,
          protocol,
          appData,
        } = request.data;

        const transport = peer.data.transports.get(transportId);

        if (!transport)
          throw new Error(`transport with id "${transportId}" not found`);

        const dataProducer = await transport.produceData({
          sctpStreamParameters,
          label,
          protocol,
          appData,
        });

        // Store the Producer into the protoo Peer data Object.
        peer.data.dataProducers.set(dataProducer.id, dataProducer);

        accept({ id: dataProducer.id });

        switch (dataProducer.label) {
          case "chat": {
            // Create a server-side DataConsumer for each Peer.
            for (const otherPeer of this._getJoinedPeers({
              excludePeer: peer,
            })) {
              this._createDataConsumer({
                dataConsumerPeer: otherPeer,
                dataProducerPeer: peer,
                dataProducer,
              });
            }

            break;
          }

          case "bot": {
            // Pass it to the bot.
            this._bot.handlePeerDataProducer({
              dataProducerId: dataProducer.id,
              peer,
            });

            break;
          }
        }

        break;
      }

      case "changeDisplayName": {
        // Ensure the Peer is joined.
        if (!peer.data.joined) throw new Error("Peer not yet joined");

        const { displayName } = request.data;
        const oldDisplayName = peer.data.displayName;

        // Store the display name into the custom data Object of the protoo
        // Peer.
        peer.data.displayName = displayName;

        // Notify other joined Peers.
        for (const otherPeer of this._getJoinedPeers({ excludePeer: peer })) {
          otherPeer
            .notify("peerDisplayNameChanged", {
              peerId: peer.id,
              displayName,
              oldDisplayName,
            })
            .catch(() => {});
        }

        accept(null);

        break;
      }

      default: {
        console.log('unknown request.method "%s"', request.method);

        reject(500, `unknown request.method "${request.method}"`);
      }
    }
  }

  _getJoinedPeers({
    excludePeer = undefined,
  }: {
    excludePeer?: protoo.Peer | undefined;
  } = {}): protoo.Peer[] {
    return this._protooRoom.peers.filter(
      (peer: protoo.Peer) => peer.data.joined && peer !== excludePeer
    );
  }

  // TODO: add peer type
  async _createConsumer({
    consumerPeer,
    producerPeer,
    producer,
  }: RoomTypes.CreateConsumer) {
    // Optimization:
    // - Create the server-side Consumer in paused mode.
    // - Tell its Peer about it and wait for its response.
    // - Upon receipt of the response, resume the server-side Consumer.
    // - If video, this will mean a single key frame requested by the
    //   server-side Consumer (when resuming it).
    // - If audio (or video), it will avoid that RTP packets are received by the
    //   remote endpoint *before* the Consumer is locally created in the endpoint
    //   (and before the local SDP O/A procedure ends). If that happens (RTP
    //   packets are received before the SDP O/A is done) the PeerConnection may
    //   fail to associate the RTP stream.

    // NOTE: Don't create the Consumer if the remote Peer cannot consume it.
    if (!producer) return;
    if (
      !consumerPeer.data.rtpCapabilities ||
      !this._mediasoupRouter.canConsume({
        producerId: producer.id,
        rtpCapabilities: consumerPeer.data.rtpCapabilities,
      })
    ) {
      return;
    }

    // Must take the Transport the remote Peer is using for consuming.
    const transport = Array.from<Transport>(
      consumerPeer.data.transports.values()
    ).find((t: any) => t.appData.consuming);

    // This should not happen.
    if (!transport) {
      console.log("_createConsumer() | Transport for consuming not found");
      return;
    }

    // Create the Consumer in paused mode.
    let consumer: any;

    try {
      consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: consumerPeer.data.rtpCapabilities,
        paused: true,
      });
    } catch (error) {
      console.log("_createConsumer() | transport.consume():%o", error);
      return;
    }

    // Store the Consumer into the protoo consumerPeer data Object.
    consumerPeer.data.consumers.set(consumer.id, consumer);

    // Set Consumer events.
    consumer.on("transportclose", () => {
      // Remove from its map.
      consumerPeer.data.consumers.delete(consumer.id);
    });

    consumer.on("producerclose", () => {
      console.log("producerclosed");
      // Remove from its map.
      consumerPeer.data.consumers.delete(consumer.id);

      consumerPeer
        .notify("consumerClosed", { consumerId: consumer.id })
        .catch(() => {});
    });

    consumer.on("producerpause", () => {
      consumerPeer
        .notify("consumerPaused", { consumerId: consumer.id })
        .catch(() => {});
    });

    consumer.on("producerresume", () => {
      consumerPeer
        .notify("consumerResumed", { consumerId: consumer.id })
        .catch(() => {});
    });

    consumer.on("score", (score: any) => {
      // logger.debug(
      // 	'consumer "score" event [consumerId:%s, score:%o]',
      // 	consumer.id, score);

      consumerPeer
        .notify("consumerScore", { consumerId: consumer.id, score })
        .catch(() => {});
    });

    consumer.on("layerschange", (layers: any) => {
      consumerPeer
        .notify("consumerLayersChanged", {
          consumerId: consumer.id,
          spatialLayer: layers ? layers.spatialLayer : null,
          temporalLayer: layers ? layers.temporalLayer : null,
        })
        .catch(() => {});
    });

    // NOTE: For testing.
    // await consumer.enableTraceEvent([ 'rtp', 'keyframe', 'nack', 'pli', 'fir' ]);
    // await consumer.enableTraceEvent([ 'pli', 'fir' ]);
    // await consumer.enableTraceEvent([ 'keyframe' ]);

    /* consumer.on("trace", (trace: any) => {
      console.log(
        'consumer "trace" event [producerId:%s, trace.type:%s, trace:%o]',
        consumer.id,
        trace.type,
        trace
      );
    }); */

    // Send a protoo request to the remote Peer with Consumer parameters.
    try {
      await consumerPeer.request("newConsumer", {
        peerId: producerPeer.id,
        producerId: producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        appData: producer.appData,
        producerPaused: consumer.producerPaused,
      });

      // Now that we got the positive response from the remote endpoint, resume
      // the Consumer so the remote endpoint will receive the a first RTP packet
      // of this new stream once its PeerConnection is already ready to process
      // and associate it.
      await consumer.resume();

      consumerPeer
        .notify("consumerScore", {
          consumerId: consumer.id,
          score: consumer.score,
        })
        .catch(() => {});
    } catch (error) {
      console.log("_createConsumer() | failed:%o", error);
    }
  }

  async _createDataConsumer({
    dataConsumerPeer,
    dataProducerPeer = null, // This is null for the bot DataProducer.
    dataProducer,
  }: RoomTypes.CreateDataConsumer) {
    // NOTE: Don't create the DataConsumer if the remote Peer cannot consume it.
    if (!dataConsumerPeer.data.sctpCapabilities) return;

    // Must take the Transport the remote Peer is using for consuming.
    const transport = Array.from<Transport>(
      dataConsumerPeer.data.transports.values()
    ).find((t: any) => t.appData.consuming);

    // This should not happen.
    if (!transport) {
      console.log("_createDataConsumer() | Transport for consuming not found");

      return;
    }

    // Create the DataConsumer.
    let dataConsumer: DataConsumer;

    try {
      dataConsumer = await transport.consumeData({
        dataProducerId: dataProducer.id,
      });
    } catch (error) {
      console.log("_createDataConsumer() | transport.consumeData():%o", error);

      return;
    }

    // Store the DataConsumer into the protoo dataConsumerPeer data Object.
    dataConsumerPeer.data.dataConsumers.set(dataConsumer.id, dataConsumer);

    // Set DataConsumer events.
    dataConsumer.on("transportclose", () => {
      // Remove from its map.
      dataConsumerPeer.data.dataConsumers.delete(dataConsumer.id);
    });

    dataConsumer.on("dataproducerclose", () => {
      // Remove from its map.
      dataConsumerPeer.data.dataConsumers.delete(dataConsumer.id);

      dataConsumerPeer
        .notify("dataConsumerClosed", { dataConsumerId: dataConsumer.id })
        .catch(() => {});
    });

    // Send a protoo request to the remote Peer with Consumer parameters.
    try {
      await dataConsumerPeer.request("newDataConsumer", {
        // This is null for bot DataProducer.
        peerId: dataProducerPeer ? dataProducerPeer.id : null,
        dataProducerId: dataProducer.id,
        id: dataConsumer.id,
        sctpStreamParameters: dataConsumer.sctpStreamParameters,
        label: dataConsumer.label,
        protocol: dataConsumer.protocol,
        appData: dataProducer.appData,
      });
    } catch (error) {
      console.log("_createDataConsumer() | failed:%o", error);
    }
  }
}
