let protooPort = process.env.PORT;

type ProtooURLParams = {
  roomId: string;
  peerId: string;
};

export function getProtooUrl({ roomId, peerId }: ProtooURLParams) {
  const hostname = "localhost";

  return `wss://${hostname}:${protooPort}/?roomId=${roomId}&peerId=${peerId}`;
}
