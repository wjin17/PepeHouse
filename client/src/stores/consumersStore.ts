import create from "zustand";
import { combine } from "zustand/middleware";
import { Consumer } from "mediasoup-client/lib/types";

/*
consumer: null as Consumer | null,
      locallyPaused: false as boolean,
      remotelyPaused: false as boolean,
      spatialLayers: 0 as number,
      temporalLayers: 0 as number,
      currentSpatialLayer: undefined as number | undefined,
      currentTemporalLayer: undefined as number | undefined,
      preferredSpatialLayer: undefined as number | undefined,
      preferredTemporalLayer: undefined as number | undefined,

      {
            ...state,
            consumer: con,
            locallyPaused,
            remotelyPaused,
            spatialLayers,
            temporalLayers,
            preferredSpatialLayer: spatialLayers - 1,
            preferredTemporalLayer: temporalLayers - 1,
          }
*/

interface ConsumerData {
  consumer: Consumer;
  type: string;
  locallyPaused: boolean;
  remotelyPaused: boolean;
  spatialLayers: number;
  temporalLayers: number;
  currentSpatialLayer: number | undefined;
  currentTemporalLayer: number | undefined;
  preferredSpatialLayer: number;
  preferredTemporalLayer: number;
}

export const consumersStore = create(
  combine(
    {
      consumers: {} as Record<string, ConsumerData>,
    },
    (set) => ({
      set,
      addConsumer: (
        con: Consumer,
        type: string,
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
          return {
            consumers: {
              ...state.consumers,
              [con.id]: {
                consumer: con,
                type,
                locallyPaused,
                remotelyPaused,
                spatialLayers,
                temporalLayers,
                currentSpatialLayer: undefined,
                currentTemporalLayer: undefined,
                preferredSpatialLayer: spatialLayers - 1,
                preferredTemporalLayer: temporalLayers - 1,
              },
            },
          };
        }),
      removeConsumer: (consumerId: string) =>
        set((state) => {
          console.log("removing consumer", consumerId);
          if (consumerId in state.consumers) {
            delete state.consumers[consumerId];
          }
          console.log("shoulda performed removal", {
            consumers: { ...state.consumers },
          });
          return {
            consumers: { ...state.consumers },
          };
        }),
    })
  )
);
