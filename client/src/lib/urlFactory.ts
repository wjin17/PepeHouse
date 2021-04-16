let protooPort = process.env.PORT || 5000;

type ProtooURLParams = {
  roomId: string;
  peerId: string;
};

export function getProtooUrl({ roomId, peerId }: ProtooURLParams) {
  const hostname = window.location.hostname;
  if (hostname === "localhost") {
    //if (false) {
    return `ws://${hostname}:${protooPort}/?roomId=${roomId}&peerId=${peerId}`;
  } else {
    return `wss://pepehouse.tv/?roomId=${roomId}&peerId=${peerId}`;
  }

  //return `wss://${hostname}:${protooPort}/?roomId=${roomId}&peerId=${peerId}`;
}
