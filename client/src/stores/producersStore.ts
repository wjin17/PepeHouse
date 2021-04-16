import create from "zustand";
import { combine } from "zustand/middleware";
import { Producer } from "mediasoup-client/lib/types";

interface ProducerData {
  producer: Producer;
  track: MediaStreamTrack;
  type: string;
  codec: string;
}

export const producersStore = create(
  combine(
    {
      producers: {} as Record<string, ProducerData>,
    },
    (set) => ({
      addProducer: (
        prod: Producer,
        track: MediaStreamTrack,
        type: string,
        codec: string
      ) =>
        set((state) => {
          return {
            producers: {
              ...state.producers,
              [prod.id]: { producer: prod, track, type, codec },
            },
          };
        }),
      removeProducer: (producerId: string) =>
        set((state) => {
          if (producerId in state.producers) {
            delete state.producers[`${producerId}`];
          }
          return {
            producers: { ...state.producers },
          };
        }),
    })
  )
);
