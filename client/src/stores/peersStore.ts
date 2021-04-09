import create from "zustand";
import { combine } from "zustand/middleware";
import { Peer } from "protoo-client";

interface Peers {
  [key: string]: any;
}

export const peersStore = create(
  combine(
    {
      peerMap: {} as Record<
        string,
        {
          peer: any;
          consumers: string[];
          dataConsumers: string[];
        }
      >,
    },
    (set) => ({
      set,
      addPeer: (p: any, consumers: any[], dataConsumers: any[]) =>
        set((state) => {
          return {
            peerMap: {
              ...state.peerMap,
              [p.id]: {
                peer: p,
                consumers,
                dataConsumers,
              },
            },
          };
        }),
      removePeer: (peerId: string) =>
        set((state) => {
          if (peerId in state.peerMap) {
            delete state.peerMap[`${peerId}`];
          }
          return {
            peerMap: { ...state.peerMap },
          };
        }),
    })
  )
);
