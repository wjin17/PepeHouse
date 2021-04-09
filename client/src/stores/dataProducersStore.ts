import create from "zustand";
import { combine } from "zustand/middleware";
import { DataProducer } from "mediasoup-client/lib/types";

interface DataProducers {
  [key: string]: DataProducer;
}

const initialState = {};

export const dataProducersStore = create(
  combine(
    {
      dataProducers: initialState as DataProducers,
    },
    (set) => ({
      set,
      addDataProducer: (fn: (prod: DataProducers) => DataProducers) =>
        set((state) => ({ dataProducers: fn(state.dataProducers) })),
    })
  )
);
