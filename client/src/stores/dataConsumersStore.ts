import create from "zustand";
import { combine } from "zustand/middleware";
import { DataConsumer } from "mediasoup-client/lib/types";

export const dataConsumersStore = create(
  combine(
    {
      dataConsumerMap: {} as Record<
        string,
        {
          dataConsumer: DataConsumer;
        }
      >,
    },
    (set) => ({
      set,
      addDataConsumer: (dc: DataConsumer) =>
        set((state) => {
          if (dc.id in state.dataConsumerMap) {
            const existingDataConsumer = state.dataConsumerMap[dc.id];
            existingDataConsumer.dataConsumer.close();
          }
          return {
            dataConsumerMap: {
              ...state.dataConsumerMap,
              [dc.id]: {
                dataConsumer: dc,
              },
            },
          };
        }),
      removeDataConsumer: (dataConsumerId: string) =>
        set((state) => {
          if (dataConsumerId in state.dataConsumerMap) {
            const existingConsumer = state.dataConsumerMap[dataConsumerId];
            existingConsumer.dataConsumer.close();
            delete state.dataConsumerMap[dataConsumerId];
          }
          return {
            dataConsumerMap: { ...state.dataConsumerMap },
          };
        }),
      closeAll: () =>
        set((state) => {
          Object.values(state.dataConsumerMap).forEach(
            ({ dataConsumer: dc }) => !dc.closed && dc.close()
          );
          return {
            dataConsumerMap: {},
          };
        }),
    })
  )
);
