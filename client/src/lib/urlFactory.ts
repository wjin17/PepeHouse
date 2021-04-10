let protooPort = process.env.PORT || 5000;

type ProtooURLParams = {
  roomId: string;
  peerId: string;
};

export function getProtooUrl({ roomId, peerId }: ProtooURLParams) {
  const hostname = window.location.hostname;
  if (hostname === "localhost") {
    //if (false) {
    console.log(hostname);
    return `ws://${hostname}:${protooPort}/?roomId=${roomId}&peerId=${peerId}`;
  } else {
    return `wss://pepe-house.herokuapp.com/?roomId=${roomId}&peerId=${peerId}`;
  }

  //return `wss://${hostname}:${protooPort}/?roomId=${roomId}&peerId=${peerId}`;
}
