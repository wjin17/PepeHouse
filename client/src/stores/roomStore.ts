import create from "zustand";
import { combine } from "zustand/middleware";

type CurrentRoom = {
  url: string | null;
  status: string; // new/connecting/connected/disconnected/closed,
};

const initialState = {
  url: null,
  status: "new",
};

export const roomStore = create(
  combine(
    {
      room: initialState as CurrentRoom,
    },
    (set) => ({
      set,
      setRoom: (fn: (cr: CurrentRoom) => CurrentRoom) =>
        set((state) => ({ room: fn(state.room) })),
    })
  )
);
