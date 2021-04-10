let protooPort = process.env.PORT;

type ProtooURLParams = {
  roomId: string;
  peerId: string;
};

export function getProtooUrl({ roomId, peerId }: ProtooURLParams) {
  const hostname = "http://localhost";

  return `ws://${hostname}:${protooPort}/?roomId=${roomId}&peerId=${peerId}`;
}
