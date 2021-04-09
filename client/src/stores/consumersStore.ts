import create from "zustand";
import { combine } from "zustand/middleware";
import { Consumer } from "mediasoup-client/lib/types";

export const consumersStore = create(
  combine(
    {
      consumer: null as Consumer | null,
      locallyPaused: false as boolean,
      remotelyPaused: false as boolean,
      spatialLayers: 0 as number,
      temporalLayers: 0 as number,
      currentSpatialLayer: undefined as number | undefined,
      currentTemporalLayer: undefined as number | undefined,
      preferredSpatialLayer: undefined as number | undefined,
      preferredTemporalLayer: undefined as number | undefined,
    },
    (set) => ({
      set,
      addConsumer: (
        con: Consumer,
        locallyPaused: boolean,
        remotelyPaused: boolean,
        spatialLayers: number,
        temporalLayers: number
      ) =>
        set((state) => {
          /* if (consumerId in state.consumer) {
            const existingConsumer = state.consumer;
            existingConsumer.consumer.close();
          } */
          console.log("addin consumer", con);
          return {
            ...state,
            consumer: con,
            locallyPaused,
            remotelyPaused,
            spatialLayers,
            temporalLayers,
            preferredSpatialLayer: spatialLayers - 1,
            preferredTemporalLayer: temporalLayers - 1,
          };
        }),
      removeConsumer: () =>
        set(() => {
          return {
            consumer: null,
            locallyPaused: false,
            remotelyPaused: false,
            spatialLayers: 0,
            temporalLayers: 0,
            currentSpatialLayer: undefined,
            currentTemporalLayer: undefined,
            preferredSpatialLayer: undefined,
            preferredTemporalLayer: undefined,
          };
        }),
    })
  )
);
