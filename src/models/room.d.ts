import {
  Worker,
  Producer,
  Transport,
  Consumers,
  DataProducer,
  DataConsumers,
} from "mediasoup/lib/types";
import { AcceptFn, RejectFn, Peer } from "protoo-server";

export type CreateParams = {
  mediasoupWorker: Worker;
  roomId: string;
};

export type RoomParams = {
  roomId: string;
  protooRoom: protoo.Room;
  mediasoupRouter: Router;
  bot: Bot;
};

export type ProtooConnectionParams = {
  peerId: string;
  protooWebSocketTransport: protoo.WebSocketTransport;
};

export interface BroadcasterParams {
  id: string;
  displayName: string;
  device?: {
    flag?: string;
    name?: string;
    version?: string;
  };
  rtpCapabilities: RtpCapabilities;
}

export interface Broadcaster {
  id: string;
  data: {
    displayName: string;
    device?: {
      flag?: string;
      name?: string;
      version?: string;
    };
    transports: Map<string, Transport>;
    producers: Map<string, Producer>;
    consumers: Map<string, Consumer>;
    dataProducers: Map<string, DataProducer>;
    dataConsumers: Map<string, dataConsumers>;
    rtpCapabilities?: RtpCapabilities;
  };
}

export type BroadcasterTransportParams = {
  broadcasterId: string;
  sctpCapabilities: SctpCapabilities;
};

export type ConnectBroadcasterTransport = {
  broadcasterId: string;
  transportId: string;
  dtlsParameters: RTCDtlsParameters;
};

export type CreateBroadcasterProducer = {
  broadcasterId: string;
  transportId: string;
  kind: any;
  rtpParameters: RTCRtpParameters;
};

export type CreateBroadcasterConsumer = {
  broadcasterId: string;
  transportId: string;
  producerId: string;
};

export type CreateBroadcasterDataConsumer = {
  broadcasterId: string;
  transportId: string;
  dataProducerId: string;
};

export type CreateBroadcasterDataProducer = {
  broadcasterId;
  transportId;
  label;
  protocol;
  sctpStreamParameters;
  appData;
};

export type CreateConsumer = {
  consumerPeer: Peer;
  producerPeer: Broadcaster;
  producer: Producer;
};

export type CreateDataConsumer = {
  dataConsumerPeer: any;
  dataProducerPeer: any;
  dataProducer: Producer;
};

export type WebRtcTransportOptions = {
  enableSctp: boolean;
  numSctpStreams: any;
  appData: {
    producing: any;
    consuming: any;
  };
  listenIps: {
    ip: string;
    announcedIp: string | undefined;
  }[];
  initialAvailableOutgoingBitrate: number;
  minimumAvailableOutgoingBitrate: number;
  maxSctpMessageSize: number;
  maxIncomingBitrate: number;
  enableUdp?: boolean;
  enableTcp?: boolean;
};
