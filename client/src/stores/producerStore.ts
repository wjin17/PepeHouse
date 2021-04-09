import create from "zustand";
import { combine } from "zustand/middleware";
import { Producer, RtpParameters } from "mediasoup-client/lib/types";

export const producerStore = create(
  combine(
    {
      producer: null as Producer | null,
      track: null as MediaStreamTrack | null,
      type: "share",
      codec: null as string | null,
    },
    (set) => ({
      addProducer: (prod: Producer, track: MediaStreamTrack, codec: string) =>
        set((state) => {
          console.log("adding producer", prod);
          if (state.producer && !state.producer.closed) state.producer.close();
          return { producer: prod, track, codec };
        }),
      removeProducer: () =>
        set((state) => {
          if (state.producer && !state.producer.closed) state.producer.close();
          return { producer: null };
        }),
    })
  )
);
