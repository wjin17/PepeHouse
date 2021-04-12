import protooClient from "protoo-client";
import * as mediasoupClient from "mediasoup-client";
import {
  Device,
  Transport,
  Producer,
  DataProducer,
  Consumer,
  DataConsumer,
} from "mediasoup-client/lib/types";

import { getProtooUrl } from "./urlFactory";
import { roomStore } from "../stores/roomStore";
import { meStore } from "../stores/meStore";
import { producerStore } from "../stores/producerStore";
import { dataProducersStore } from "../stores/dataProducersStore";
import { consumersStore } from "../stores/consumersStore";
import { dataConsumersStore } from "../stores/dataConsumersStore";
import { peersStore } from "../stores/peersStore";
import { chatStore } from "../stores/chatStore";

const { addProducer, removeProducer } = producerStore.getState();
const { addConsumer, removeConsumer } = consumersStore.getState();
const { addDataConsumer, removeDataConsumer } = dataConsumersStore.getState();
const { addPeer, removePeer } = peersStore.getState();
const { addMessage, clearMessages } = chatStore.getState();

const PC_PROPRIETARY_CONSTRAINTS = {
  optional: [{ googDscp: true }],
};

const SCREEN_SHARING_SVC_ENCODINGS = [{ scalabilityMode: "S3T3", dtx: true }];

type RoomClientParams = {
  roomId: string;
  peerId: string;
  displayName: string;
  device: object;
  //handlerName: string;
  produce: boolean;
  consume: boolean;
};

export default class RoomClient {
  _closed: boolean;
  _displayName: string;
  _device;
  _produce: boolean;
  _consume: boolean;
  _protooUrl: string;
  _protoo: protooClient.Peer | null;
  _mediasoupDevice: Device | null;
  _sendTransport: Transport | null;
  _recvTransport: Transport | null;
  _shareProducer: Producer | null;
  _chatDataProducer: DataProducer | null;
  _botDataProducer: DataProducer | null;
  _consumers: Map<String, Consumer>;
  _dataConsumers: Map<String, DataConsumer>;
  _nextDataChannelTestNumber: number;
  _chatEnabled: boolean;

  constructor({
    roomId,
    peerId,
    displayName,
    device,
    produce,
    consume,
  }: RoomClientParams) {
    this._closed = false;
    this._displayName = displayName;
    this._device = device;
    this._produce = produce;
    this._consume = consume;
    this._protooUrl = getProtooUrl({ roomId, peerId });
    this._protoo = null;
    this._mediasoupDevice = null;
    this._sendTransport = null;
    this._recvTransport = null;
    this._shareProducer = null;
    this._chatDataProducer = null;
    this._botDataProducer = null;
    this._consumers = new Map();
    this._dataConsumers = new Map();
    this._nextDataChannelTestNumber = 0;
    this._chatEnabled = false;
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    console.log("close()");
    // Close protoo Peer
    if (this._protoo) {
      this._protoo.close();
    }

    // Close mediasoup Transports.
    if (this._sendTransport) this._sendTransport.close();
    if (this._recvTransport) this._recvTransport.close();

    // Update room state to "closed"
    roomStore.setState((cr) => ({ ...cr, status: "closed" }));
    //store.dispatch(stateActions.setRoomState("closed"));
  }

  async join() {
    const protooTransport = new protooClient.WebSocketTransport(
      this._protooUrl
    );
    this._protoo = new protooClient.Peer(protooTransport);

    // Update room state to "connecting"
    // TODO: add room context
    roomStore.setState((cr) => ({ ...cr, status: "connecting" }));
    //store.dispatch(stateActions.setRoomState("connecting"));

    this._protoo.on("open", () => this._joinRoom());
    this._protoo.on("failed", () => {
      // Update state to connection failed
      // TODO: add notify context
      /* store.dispatch(
        requestActions.notify({
          type: "error",
          text: "WebSocket connection failed",
        })
      ); */
    });

    this._protoo.on("disconnected", () => {
      // Update state to disconnected
      // TODO: add notify context
      /* store.dispatch(
        requestActions.notify({
          type: "error",
          text: "WebSocket disconnected",
        })
      ); */

      // Close mediasoup Transports.
      if (this._sendTransport) {
        this._sendTransport.close();
        this._sendTransport = null;
      }

      if (this._recvTransport) {
        this._recvTransport.close();
        this._recvTransport = null;
      }

      // Update room state to "closed"
      // TODO: add room context
      roomStore.setState((cr) => ({ ...cr, status: "closed" }));
      //store.dispatch(stateActions.setRoomState("closed"));
    });

    this._protoo.on("close", () => {
      if (this._closed) return;
      this.close();
    });

    // eslint-disable-next-line no-unused-vars
    this._protoo.on("request", async (request, accept, reject) => {
      console.log(
        'proto "request" event [method:%s, data:%o]',
        request.method,
        request.data
      );

      switch (request.method) {
        case "newConsumer": {
          if (!this._consume) {
            reject(403, "I do not want to consume");
            break;
          }

          const {
            peerId,
            producerId,
            id,
            kind,
            rtpParameters,
            appData,
            producerPaused,
          } = request.data;

          try {
            const consumer = await this._recvTransport!.consume({
              id,
              producerId,
              kind,
              rtpParameters,
              appData: { ...appData, peerId }, // Trick.
            });

            // Store in the map.
            /* this._consumers.set(consumer.id, consumer);

            consumer.on("transportclose", () => {
              this._consumers.delete(consumer.id);
            }); */

            const {
              spatialLayers,
              temporalLayers,
            } = mediasoupClient.parseScalabilityMode(
              consumer!.rtpParameters!.encodings![0].scalabilityMode
            );

            // Update state with consumer
            // TODO: add consumer context
            const locallyPaused = false;
            const remotelyPaused = producerPaused as boolean;

            addConsumer(
              consumer,
              locallyPaused,
              remotelyPaused,
              spatialLayers,
              temporalLayers
            );

            peersStore.setState((state) => {
              const existingPeer = state.peerMap[peerId];
              if (!existingPeer) throw Error("No peer found");
              const newConsumers = [...existingPeer.consumers, consumer.id];
              const newPeer = {
                ...existingPeer,
                consumers: newConsumers,
              };
              return {
                peerMap: { ...state.peerMap, [peerId]: newPeer },
              };
            });

            // We are ready. Answer the protoo request so the server will
            // resume this Consumer (which was paused for now if video).
            accept();
          } catch (error) {
            console.log('"newConsumer" request failed:%o', error);

            // Update state with error
            // TODO: add notify context
            /* store.dispatch(
              requestActions.notify({
                type: "error",
                text: `Error creating a Consumer: ${error}`,
              })
            ); */

            throw error;
          }

          break;
        }

        case "newDataConsumer": {
          if (!this._consume) {
            reject(403, "I do not want to data consume");
            break;
          }

          const {
            peerId, // NOTE: Null if bot.
            dataProducerId,
            id,
            sctpStreamParameters,
            label,
            protocol,
            appData,
          } = request.data;

          try {
            const dataConsumer = await this._recvTransport!.consumeData({
              id,
              dataProducerId,
              sctpStreamParameters,
              label,
              protocol,
              appData: { ...appData, peerId }, // Trick.
            });

            // Store in the map.
            this._dataConsumers.set(dataConsumer.id, dataConsumer);

            dataConsumer.on("transportclose", () => {
              this._dataConsumers.delete(dataConsumer.id);
            });

            dataConsumer.on("open", () => {
              console.log('DataConsumer "open" event');
              if (!this._chatEnabled) {
                this.enableChatDataProducer();
                this.enableBotDataProducer();
                this._chatEnabled = true;
              }
            });

            dataConsumer.on("close", () => {
              console.log('DataConsumer "close" event');

              this._dataConsumers.delete(dataConsumer.id);
              // TODO: add notify context
              /* store.dispatch(
                requestActions.notify({
                  type: "error",
                  text: "DataConsumer closed",
                })
              ); */
            });

            dataConsumer.on("error", (error) => {
              console.log('DataConsumer "error" event:%o', error);
              // TODO: add notify context
              /* store.dispatch(
                requestActions.notify({
                  type: "error",
                  text: `DataConsumer error: ${error}`,
                })
              ); */
            });

            dataConsumer.on("message", (message) => {
              console.log(
                'DataConsumer "message" event [streamId:%d]',
                dataConsumer.sctpStreamParameters.streamId
              );

              if (message instanceof ArrayBuffer) {
                const view = new DataView(message);
                // needs byte offset wtf whatever that means
                const number = view.getUint32(0);

                if (number === Math.pow(2, 32) - 1) {
                  console.log("dataChannelTest finished!");

                  this._nextDataChannelTestNumber = 0;

                  return;
                }

                if (number > this._nextDataChannelTestNumber) {
                  console.log(
                    "dataChannelTest: %s packets missing",
                    number - this._nextDataChannelTestNumber
                  );
                }

                this._nextDataChannelTestNumber = number + 1;

                return;
              } else if (typeof message !== "string") {
                console.log('ignoring DataConsumer "message" (not a string)');

                return;
              }

              switch (dataConsumer.label) {
                case "chat": {
                  const { peerMap } = peersStore.getState();
                  const peersArray = Object.keys(peerMap).map(
                    (_peerId: string) => peerMap[_peerId]
                  );
                  const sendingPeer = peersArray.find((peer) =>
                    peer.dataConsumers.includes(dataConsumer.id)
                  );
                  if (!sendingPeer) {
                    console.log('DataConsumer "message" from unknown peer');
                    break;
                  }

                  addMessage({
                    displayName: sendingPeer.peer.displayName,
                    content: message,
                    type: "chat",
                  });

                  // TODO: add peers context
                  /* const { peers } = store.getState();
                  const peersArray = Object.keys(peers).map(
                    (_peerId) => peers[_peerId]
                  );
                  const sendingPeer = peersArray.find((peer) =>
                    peer.dataConsumers.includes(dataConsumer.id)
                  );

                  if (!sendingPeer) {
                    console.log('DataConsumer "message" from unknown peer');
                    break;
                  } */

                  // TODO: add notify context
                  /* store.dispatch(
                    requestActions.notify({
                      title: `${sendingPeer.displayName} says:`,
                      text: message,
                      timeout: 5000,
                    })
                  ); */

                  break;
                }

                case "bot": {
                  addMessage({
                    displayName: "PepeHouse Bot",
                    content: message,
                    type: "chat",
                  });
                  // TODO: add notify context
                  /* store.dispatch(
                    requestActions.notify({
                      title: "Message from Bot:",
                      text: message,
                      timeout: 5000,
                    })
                  ); */

                  break;
                }
              }
            });

            // TODO: add dataconsumer context
            addDataConsumer(dataConsumer);

            peersStore.setState((state) => {
              if (!peerId) {
                return { peerMap: { ...state.peerMap } };
              }
              const existingPeer = state.peerMap[peerId];
              if (!existingPeer) throw Error("No peer found");
              const newDataConsumers = [
                ...existingPeer.dataConsumers,
                dataConsumer.id,
              ];
              const newPeer = {
                ...existingPeer,
                dataConsumers: newDataConsumers,
              };
              return {
                peerMap: { ...state.peerMap, [peerId]: newPeer },
              };
            });

            /* store.dispatch(
              stateActions.addDataConsumer(
                {
                  id: dataConsumer.id,
                  sctpStreamParameters: dataConsumer.sctpStreamParameters,
                  label: dataConsumer.label,
                  protocol: dataConsumer.protocol,
                },
                peerId
              )
            ); */

            // We are ready. Answer the protoo request.
            accept();
          } catch (error) {
            console.log('"newDataConsumer" request failed:%o', error);

            // TODO: add notify context
            /* store.dispatch(
              requestActions.notify({
                type: "error",
                text: `Error creating a DataConsumer: ${error}`,
              })
            ); */

            throw error;
          }

          break;
        }
      }
    });

    this._protoo.on("notification", (notification) => {
      /* console.log(
        'proto "notification" event [method:%s, data:%o]',
        notification.method,
        notification.data
      ); */

      switch (notification.method) {
        case "producerScore": {
          const { producerId, score } = notification.data;

          // TODO: add producer context
          //store.dispatch(stateActions.setProducerScore(producerId, score));

          break;
        }

        case "newPeer": {
          const peer = notification.data;

          // TODO: add peer context
          addPeer(peer, [], []);
          /* store.dispatch(
            stateActions.addPeer({ ...peer, consumers: [], dataConsumers: [] })
          ); */
          addMessage({
            content: `${peer.displayName} has joined the room`,
            type: "notification",
          });

          // TODO: add notify context
          /* store.dispatch(
            requestActions.notify({
              text: `${peer.displayName} has joined the room`,
            })
          ); */

          break;
        }

        case "peerClosed": {
          console.log("peer was closed");
          const { peerId, displayName } = notification.data;

          // TODO: add peer context
          removePeer(peerId);

          addMessage({
            content: `${displayName} has left :c`,
            type: "notification",
          });
          //store.dispatch(stateActions.removePeer(peerId));

          break;
        }

        case "peerDisplayNameChanged": {
          console.log("peer display name changed");
          const { peerId, displayName, oldDisplayName } = notification.data;

          // TODO: add peer context
          peersStore.setState((state) => {
            const existingPeer = state.peerMap[peerId];
            const newPeer = {
              ...existingPeer,
              displayName,
            };
            return { ...state.peerMap, [peerId]: newPeer };
          });
          //store.dispatch(stateActions.setPeerDisplayName(displayName, peerId));

          // TODO: add notify context
          addMessage({
            content: `${oldDisplayName} changed their name to ${displayName}`,
            type: "notification",
          });

          /* store.dispatch(
            requestActions.notify({
              text: `${oldDisplayName} is now ${displayName}`,
            })
          ); */

          break;
        }

        case "downlinkBwe": {
          //console.log("'downlinkBwe' event:%o", notification.data);

          break;
        }

        case "consumerClosed": {
          const { consumerId } = notification.data;
          const consumer = this._consumers.get(consumerId);

          if (!consumer) break;

          consumer.close();
          this._consumers.delete(consumerId);

          const { peerId } = consumer.appData;

          // TODO: add consumers context
          removeConsumer();

          peersStore.setState((state) => {
            if (!peerId) {
              return { peerMap: { ...state.peerMap } };
            }
            const existingPeer = state.peerMap[peerId];
            if (!existingPeer) {
              return { peerMap: { ...state.peerMap } };
            }
            const idx = existingPeer.consumers.indexOf(consumerId);
            if (idx === -1) throw new Error("Consumer not found");

            const newConsumers = existingPeer.consumers.slice();
            newConsumers.splice(idx, 1);

            const newPeer = {
              ...existingPeer,
              consumers: newConsumers,
            };

            return {
              peerMap: {
                ...state.peerMap,
                [peerId]: newPeer,
              },
            };
          });
          //store.dispatch(stateActions.removeConsumer(consumerId, peerId));

          break;
        }

        case "consumerPaused": {
          const { consumerId } = notification.data;
          const consumer = this._consumers.get(consumerId);

          if (!consumer) break;

          consumer.pause();

          // TODO: add consumer context
          consumersStore.setState((state) => ({
            ...state,
            remotelyPaused: true,
          }));

          break;
        }

        case "consumerResumed": {
          const { consumerId } = notification.data;
          const consumer = this._consumers.get(consumerId);

          if (!consumer) break;

          consumer.resume();

          // TODO: add consumer context
          consumersStore.setState((state) => ({
            ...state,
            remotelyPaused: false,
          }));
          //unpauseConsumer(consumerId, "remote");
          //store.dispatch(stateActions.setConsumerResumed(consumerId, "remote"));

          break;
        }

        case "consumerLayersChanged": {
          const { consumerId, spatialLayer, temporalLayer } = notification.data;
          const consumer = this._consumers.get(consumerId);

          if (!consumer) break;

          // TODO: add consumer context
          consumersStore.setState((state) => ({
            ...state,
            currentSpatialLayer: spatialLayer,
            currentTemporalLayer: temporalLayer,
          }));
          /* store.dispatch(
            stateActions.setConsumerCurrentLayers(
              consumerId,
              spatialLayer,
              temporalLayer
            )
          ); */

          break;
        }

        case "dataConsumerClosed": {
          const { dataConsumerId } = notification.data;
          const dataConsumer = this._dataConsumers.get(dataConsumerId);

          if (!dataConsumer) break;

          dataConsumer.close();
          this._dataConsumers.delete(dataConsumerId);

          const { peerId } = dataConsumer.appData;

          // TODO: add dataConsumer context
          removeDataConsumer(dataConsumerId);

          peersStore.setState((state) => {
            if (!peerId) {
              return { peerMap: { ...state.peerMap } };
            }
            const existingPeer = state.peerMap[peerId];
            if (!existingPeer) {
              return { peerMap: { ...state.peerMap } };
            }
            const idx = existingPeer.dataConsumers.indexOf(dataConsumerId);
            if (idx === -1) throw new Error("Consumer not found");

            const newDataConsumers = existingPeer.dataConsumers.slice();
            newDataConsumers.splice(idx, 1);

            const newPeer = {
              ...existingPeer,
              dataConsumers: newDataConsumers,
            };

            return {
              peerMap: {
                ...state.peerMap,
                [peerId]: newPeer,
              },
            };
          });

          /* store.dispatch(
            stateActions.removeDataConsumer(dataConsumerId, peerId)
          ); */

          break;
        }

        default: {
          console.log(
            'unknown protoo notification.method "%s"',
            notification.method
          );
        }
      }
    });
  }

  async enableShare() {
    console.log("enableShare()");

    if (this._shareProducer) return;

    if (!this._mediasoupDevice!.canProduce("video")) {
      console.log("enableShare() | cannot produce video");
      return;
    }

    let track;

    // TODO: add share context
    //store.dispatch(stateActions.setShareInProgress(true));

    try {
      console.log("enableShare() | calling getUserMedia()");
      meStore.setState((state) => {
        return { ...state, shareInProgress: true };
      });
      // @ts-ignore
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "never" },
        audio: true,
      });

      // May mean cancelled (in some implementations).
      if (!stream) {
        // TODO: add share context
        meStore.setState((m) => ({ ...m, shareInProgress: false }));
        //store.dispatch(stateActions.setShareInProgress(true));

        return;
      }

      track = stream.getTracks()[0];

      /* track!.onended(() => {
        meStore.setState((m) => {
          return { ...m, shareInProgress: false };
        });
      }); */

      const encodings = SCREEN_SHARING_SVC_ENCODINGS;
      const codec = this._mediasoupDevice!.rtpCapabilities.codecs!.find(
        (c) => c.mimeType.toLowerCase() === "video/vp9"
      );
      const codecOptions = {
        videoGoogleStartBitrate: 6000,
      };

      this._shareProducer = await this._sendTransport!.produce({
        track,
        encodings,
        codecOptions,
        codec,
        appData: {
          share: true,
        },
      });

      // TODO: add producer context
      addProducer(
        this._shareProducer,
        track,
        this._shareProducer.rtpParameters.codecs[0].mimeType.split("/")[1]
      );

      /* store.dispatch(
        stateActions.addProducer()
      ); */

      this._shareProducer.on("transportclose", () => {
        this._shareProducer = null;
      });

      this._shareProducer.on("trackended", () => {
        addMessage({
          content: "You have stopped sharing",
          type: "notification",
        });
        // TODO: add notify context
        /* store.dispatch(
          requestActions.notify({
            type: "error",
            text: "Share disconnected!",
          })
        ); */

        this.disableShare().catch(() => {});
      });
    } catch (error) {
      console.log("enableShare() | failed:%o", error);

      if (error.name !== "NotAllowedError") {
        // TODO: add notify context
        /* store.dispatch(
          requestActions.notify({
            type: "error",
            text: `Error sharing: ${error}`,
          })
        ); */
      }

      if (track) track.stop();
      meStore.setState((m) => ({ ...m, shareInProgress: false }));
    }

    // TODO: add share context

    //store.dispatch(stateActions.setShareInProgress(false));
  }

  async disableShare() {
    console.log("disableShare()");
    /* await this._protoo!.request("pauseProducer", {
      producerId: this._shareProducer!.id,
    }); */

    if (!this._shareProducer) return;

    this._shareProducer.close();

    // TODO: add producer context
    removeProducer();
    //producerStore.setState((p) => ({ ...p, producer: {} }));
    //store.dispatch(stateActions.removeProducer(this._shareProducer.id));

    try {
      await this._protoo!.request("closeProducer", {
        producerId: this._shareProducer.id,
      });
    } catch (error) {
      // TODO: add notify context
      /* store.dispatch(
        requestActions.notify({
          type: "error",
          text: `Error closing server-side share Producer: ${error}`,
        })
      ); */
    }

    this._shareProducer = null;
    meStore.setState((m) => {
      return { ...m, shareInProgress: false };
    });
  }

  async restartIce() {
    console.log("restartIce()");

    // TODO: add ice context
    meStore.setState((m) => ({ ...m, restartIceInProgress: true }));
    /* store.dispatch(
			stateActions.setRestartIceInProgress(true)); */

    try {
      if (this._sendTransport) {
        const iceParameters = await this._protoo!.request("restartIce", {
          transportId: this._sendTransport.id,
        });

        await this._sendTransport.restartIce({ iceParameters });
      }

      if (this._recvTransport) {
        const iceParameters = await this._protoo!.request("restartIce", {
          transportId: this._recvTransport.id,
        });

        await this._recvTransport.restartIce({ iceParameters });
      }
      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					text : 'ICE restarted'
				}));
                */
    } catch (error) {
      console.log("restartIce() | failed:%o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `ICE restart failed: ${error}`
				}));
		} */
      // TODO: add ice context
      meStore.setState((m) => ({ ...m, restartIceInProgress: false }));
      /* store.dispatch(
			stateActions.setRestartIceInProgress(false)); */
    }
  }

  async setMaxSendingSpatialLayer(spatialLayer: number) {
    console.log("setMaxSendingSpatialLayer() [spatialLayer:%s]", spatialLayer);

    try {
      await this._shareProducer!.setMaxSpatialLayer(spatialLayer);
    } catch (error) {
      console.log("setMaxSendingSpatialLayer() | failed:%o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `Error setting max sending video spatial layer: ${error}`
				})); */
    }
  }

  async setConsumerPreferredLayers(
    consumerId: string,
    spatialLayer: number,
    temporalLayer: number
  ) {
    console.log(
      "setConsumerPreferredLayers() [consumerId:%s, spatialLayer:%s, temporalLayer:%s]",
      consumerId,
      spatialLayer,
      temporalLayer
    );

    try {
      await this._protoo!.request("setConsumerPreferredLayers", {
        consumerId,
        spatialLayer,
        temporalLayer,
      });

      // TODO: add consumer context
      consumersStore.setState((state) => ({
        ...state,
        preferredSpatialLayer: spatialLayer,
        preferredTemporalLayer: temporalLayer,
      }));
      /* store.dispatch(stateActions.setConsumerPreferredLayers(
				consumerId, spatialLayer, temporalLayer)); */
    } catch (error) {
      console.log("setConsumerPreferredLayers() | failed:%o", error);

      // add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `Error setting Consumer preferred layers: ${error}`
				})); */
    }
  }

  async setConsumerPriority(consumerId: string, priority: number) {
    console.log(
      "setConsumerPriority() [consumerId:%s, priority:%d]",
      consumerId,
      priority
    );

    try {
      await this._protoo!.request("setConsumerPriority", {
        consumerId,
        priority,
      });

      // TODO: add consumer context
      consumersStore.setState((state) => ({
        ...state,
        priority,
      }));
      //store.dispatch(stateActions.setConsumerPriority(consumerId, priority));
    } catch (error) {
      console.log("setConsumerPriority() | failed:%o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `Error setting Consumer priority: ${error}`
				})); */
    }
  }

  async requestConsumerKeyFrame(consumerId: string) {
    console.log("requestConsumerKeyFrame() [consumerId:%s]", consumerId);

    try {
      await this._protoo!.request("requestConsumerKeyFrame", { consumerId });

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					text : 'Keyframe requested for video consumer'
				})); */
    } catch (error) {
      console.log("requestConsumerKeyFrame() | failed:%o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `Error requesting key frame for Consumer: ${error}`
				})); */
    }
  }

  async enableChatDataProducer() {
    // NOTE: Should enable this code but it's useful for testing.
    // if (this._chatDataProducer)
    // 	return;

    try {
      // Create chat DataProducer.
      this._chatDataProducer = await this._sendTransport!.produceData({
        ordered: false,
        maxRetransmits: 1,
        label: "chat",
        priority: "medium",
        appData: { info: "my-chat-DataProducer" },
      });

      // TODO: add dataProducer context
      dataProducersStore.setState((dp) => {
        const newDataProducer: any = {};
        newDataProducer[this._chatDataProducer!.id] = {
          id: this._chatDataProducer!.id,
          sctpStreamParameters: this._chatDataProducer!.sctpStreamParameters,
          label: this._chatDataProducer!.label,
          protocol: this._chatDataProducer!.protocol,
        };
        return {
          ...dp,
          ...newDataProducer,
        };
      });

      this._chatDataProducer.on("transportclose", () => {
        this._chatDataProducer = null;
      });

      this._chatDataProducer.on("open", () => {
        console.log('chat DataProducer "open" event');
      });

      this._chatDataProducer.on("close", () => {
        console.log('chat DataProducer "close" event');

        this._chatDataProducer = null;

        // TODO: add notify context
        /* store.dispatch(requestActions.notify(
					{
						type : 'error',
						text : 'Chat DataProducer closed'
					})); */
      });

      this._chatDataProducer.on("error", (error) => {
        console.log('chat DataProducer "error" event:%o', error);

        // TODO: add notify context
        /* store.dispatch(requestActions.notify(
					{
						type : 'error',
						text : `Chat DataProducer error: ${error}`
					})); */
      });

      this._chatDataProducer.on("bufferedamountlow", () => {
        console.log('chat DataProducer "bufferedamountlow" event');
      });
    } catch (error) {
      console.log("enableChatDataProducer() | failed:%o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `Error enabling chat DataProducer: ${error}`
				})); */

      throw error;
    }
  }

  async enableBotDataProducer() {
    console.log("enableBotDataProducer()");

    // NOTE: Should enable this code but it's useful for testing.
    // if (this._botDataProducer)
    // 	return;

    try {
      // Create chat DataProducer.
      this._botDataProducer = await this._sendTransport!.produceData({
        ordered: false,
        maxPacketLifeTime: 2000,
        label: "bot",
        priority: "medium",
        appData: { info: "my-bot-DataProducer" },
      });

      // TODO: add dataProducer context
      dataProducersStore.setState((dp) => {
        const newDataProducer: any = {};
        newDataProducer[this._botDataProducer!.id] = {
          id: this._botDataProducer!.id,
          sctpStreamParameters: this._botDataProducer!.sctpStreamParameters,
          label: this._botDataProducer!.label,
          protocol: this._botDataProducer!.protocol,
        };
        return {
          ...dp,
          ...newDataProducer,
        };
      });
      /* store.dispatch(stateActions.addDataProducer(
				{
					id                   : this._botDataProducer.id,
					sctpStreamParameters : this._botDataProducer.sctpStreamParameters,
					label                : this._botDataProducer.label,
					protocol             : this._botDataProducer.protocol
				})); */

      this._botDataProducer.on("transportclose", () => {
        this._botDataProducer = null;
      });

      this._botDataProducer.on("open", () => {
        console.log('bot DataProducer "open" event');
      });

      this._botDataProducer.on("close", () => {
        console.log('bot DataProducer "close" event');

        this._botDataProducer = null;

        // TODO: add notify context
        /* store.dispatch(requestActions.notify(
					{
						type : 'error',
						text : 'Bot DataProducer closed'
					})); */
      });

      this._botDataProducer.on("error", (error) => {
        console.log('bot DataProducer "error" event:%o', error);

        // TODO: add notify context
        /* store.dispatch(requestActions.notify(
					{
						type : 'error',
						text : `Bot DataProducer error: ${error}`
					})); */
      });

      this._botDataProducer.on("bufferedamountlow", () => {
        console.log('bot DataProducer "bufferedamountlow" event');
      });
    } catch (error) {
      console.log("enableBotDataProducer() | failed:%o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `Error enabling bot DataProducer: ${error}`
				})); */

      throw error;
    }
  }

  async sendChatMessage(text: string) {
    console.log('sendChatMessage() [text:"%s]', text);

    if (!this._chatDataProducer) {
      console.log("chat data producer", this._chatDataProducer);
      addMessage({
        content: "Unable to send message",
        type: "notification",
      });
      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : 'No chat DataProducer'
				})); */

      return;
    }

    try {
      this._chatDataProducer.send(text);
      addMessage({
        displayName: this._displayName,
        content: text,
        type: "chat",
      });
    } catch (error) {
      console.log("chat DataProducer.send() failed:%o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `chat DataProducer.send() failed: ${error}`
				})); */
    }
  }

  async sendBotMessage(text: string) {
    console.log('sendBotMessage() [text:"%s]', text);

    if (!this._botDataProducer) {
      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : 'No bot DataProducer'
				})); */

      return;
    }

    try {
      this._botDataProducer.send(text);
    } catch (error) {
      console.log("bot DataProducer.send() failed:%o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `bot DataProducer.send() failed: ${error}`
				})); */
    }
  }

  async changeDisplayName(displayName: string) {
    console.log('changeDisplayName() [displayName:"%s"]', displayName);

    try {
      await this._protoo!.request("changeDisplayName", { displayName });

      this._displayName = displayName;

      // TODO: add displayName context
      meStore.setState((m) => {
        return { ...m, displayName };
      });

      addMessage({
        content: `Your display name is now ${displayName}`,
        type: "notification",
      });
      /* store.dispatch(
				stateActions.setDisplayName(displayName)); */

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					text : 'Display name changed'
				})); */
    } catch (error) {
      console.log("changeDisplayName() | failed: %o", error);

      // TODO: add notify context
      /* store.dispatch(requestActions.notify(
				{
					type : 'error',
					text : `Could not change display name: ${error}`
				})); */

      // We need to refresh the component for it to render the previous
      // displayName again.

      // TODO: reset display name
      /* store.dispatch(
				stateActions.setDisplayName()); */
    }
  }

  async _joinRoom() {
    console.log("_joinRoom()");

    try {
      clearMessages();
      this._mediasoupDevice = new mediasoupClient.Device();

      const routerRtpCapabilities = await this._protoo!.request(
        "getRouterRtpCapabilities"
      );

      await this._mediasoupDevice.load({ routerRtpCapabilities });

      // Create mediasoup Transport for sending (unless we don't want to produce).
      const transportInfo = await this._protoo!.request(
        "createWebRtcTransport",
        {
          producing: true,
          consuming: false,
          sctpCapabilities: this._mediasoupDevice.sctpCapabilities,
        }
      );

      const {
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
        sctpParameters,
      } = transportInfo;

      console.log("transport info", transportInfo);

      this._sendTransport = this._mediasoupDevice.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters,
        sctpParameters,
        iceServers: [],
        proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS,
      });

      console.log("sendtp", this._sendTransport);

      this._sendTransport.on(
        "connect",
        (
          { dtlsParameters },
          callback,
          errback // eslint-disable-line no-shadow
        ) => {
          this._protoo!.request("connectWebRtcTransport", {
            transportId: this._sendTransport!.id,
            dtlsParameters,
          })
            .then(
              callback(() => {
                console.log("connected to room");
              })
            )
            .catch(errback);
        }
      );

      this._sendTransport.on(
        "produce",
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          console.log("calling produce");
          try {
            // eslint-disable-next-line no-shadow
            const { id } = await this._protoo!.request("produce", {
              transportId: this._sendTransport!.id,
              kind,
              rtpParameters,
              appData,
            });

            callback({ id });
          } catch (error) {
            errback(error);
          }
        }
      );

      this._sendTransport.on(
        "producedata",
        async (
          { sctpStreamParameters, label, protocol, appData },
          callback,
          errback
        ) => {
          console.log(
            '"producedata" event: [sctpStreamParameters:%o, appData:%o]',
            sctpStreamParameters,
            appData
          );

          try {
            // eslint-disable-next-line no-shadow
            const { id } = await this._protoo!.request("produceData", {
              transportId: this._sendTransport!.id,
              sctpStreamParameters,
              label,
              protocol,
              appData,
            });

            callback({ id });
          } catch (error) {
            errback(error);
          }
        }
      );

      // Create mediasoup Transport for receiving (unless we don't want to consume).
      if (this._consume) {
        const transportInfo = await this._protoo!.request(
          "createWebRtcTransport",
          {
            producing: false,
            consuming: true,
            sctpCapabilities: this._mediasoupDevice.sctpCapabilities,
          }
        );

        const {
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
        } = transportInfo;

        this._recvTransport = this._mediasoupDevice.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
          sctpParameters,
          iceServers: [],
        });

        this._recvTransport.on(
          "connect",
          (
            { dtlsParameters },
            callback,
            errback // eslint-disable-line no-shadow
          ) => {
            this._protoo!.request("connectWebRtcTransport", {
              transportId: this._recvTransport!.id,
              dtlsParameters,
            })
              .then(callback)
              .catch(errback);
          }
        );
      }

      // Join now into the room.
      // NOTE: Don't send our RTP capabilities if we don't want to consume.
      const { peers } = await this._protoo!.request("join", {
        displayName: this._displayName,
        device: this._device,
        rtpCapabilities: this._consume
          ? this._mediasoupDevice.rtpCapabilities
          : undefined,
        sctpCapabilities: this._mediasoupDevice.sctpCapabilities,
        role: this._produce ? "host" : "viewer",
      });

      // TODO: add room context
      roomStore.setState((cr) => ({ ...cr, status: "connected" }));
      //store.dispatch(stateActions.setRoomState("connected"));

      // Clean all the existing notifcations.
      // TODO: add notify context
      //store.dispatch(stateActions.removeAllNotifications());

      // TODO: add notify context
      addMessage({
        content: "Welcome to PepeHouse!",
        type: "notification",
      });
      /* store.dispatch(
        requestActions.notify({
          text: "You are in the room!",
          timeout: 3000,
        })
      ); */

      for (const peer of peers) {
        // TODO: add peer context
        addPeer(peer, [], []);
        /* store.dispatch(
          stateActions.addPeer({ ...peer, consumers: [], dataConsumers: [] })
        ); */
      }

      this._sendTransport!.on("connectionstatechange", (connectionState) => {
        console.log("local state changed", connectionState);
        if (connectionState === "connected") {
          console.log("connection state change");
        }
      });

      if (meStore.getState().error) {
        meStore.setState((state) => {
          return { ...state, error: null };
        });
      }
    } catch (error) {
      console.log("_joinRoom() failed:%o", error);
      meStore.setState((state) => {
        return { ...state, error: "Host exists" };
      });

      // TODO: add notify context
      /* store.dispatch(
        requestActions.notify({
          type: "error",
          text: `Could not join the room: ${error}`,
        })
      ); */

      this.close();
    }
  }
}
