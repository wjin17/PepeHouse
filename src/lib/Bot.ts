import { Router, DirectTransport, DataProducer } from "mediasoup/lib/types";

type CreateBotParams = {
  mediasoupRouter: Router;
};

type BotParams = {
  transport: DirectTransport;
  dataProducer: DataProducer;
};

type PeerDataProducerParams = {
  dataProducerId: string;
  peer: any;
};

class Bot {
  _transport: DirectTransport;
  _dataProducer: DataProducer;
  static async create({ mediasoupRouter }: CreateBotParams) {
    // Create a DirectTransport for connecting the bot.
    const transport = await mediasoupRouter.createDirectTransport({
      maxMessageSize: 512,
    });

    // Create DataProducer to send messages to peers.
    const dataProducer = await transport.produceData({ label: "bot" });

    // Create the Bot instance.
    const bot = new Bot({ transport, dataProducer });

    return bot;
  }

  constructor({ transport, dataProducer }: BotParams) {
    // mediasoup DirectTransport.
    this._transport = transport;

    // mediasoup DataProducer.
    this._dataProducer = dataProducer;
  }

  get dataProducer() {
    return this._dataProducer;
  }

  close() {
    // No need to do anyting.
  }

  async handlePeerDataProducer({
    dataProducerId,
    peer,
  }: PeerDataProducerParams) {
    // Create a DataConsumer on the DirectTransport for each Peer.
    const dataConsumer = await this._transport.consumeData({
      dataProducerId,
    });

    dataConsumer.on("message", (message: any, ppid: number) => {
      // Ensure it's a WebRTC DataChannel string.
      if (ppid !== 51) {
        return;
      }

      const text = message.toString("utf8");
      // Create a message to send it back to all Peers in behalf of the sending
      // Peer.
      const messageBack = `${peer.data.displayName} said me: "${text}"`;

      this._dataProducer.send(messageBack);
    });
  }
}

export default Bot;
