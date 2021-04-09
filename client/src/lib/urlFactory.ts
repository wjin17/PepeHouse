let protooPort = 5000;

if (window.location.hostname === "test.mediasoup.org") protooPort = 4444;

type ProtooURLParams = {
  roomId: string;
  peerId: string;
};

export function getProtooUrl({ roomId, peerId }: ProtooURLParams) {
  const hostname = window.location.hostname;

  return `ws://${hostname}:${protooPort}/?roomId=${roomId}&peerId=${peerId}`;
}
