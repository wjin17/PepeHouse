import create from "zustand";
import { combine } from "zustand/middleware";

type Message = {
  displayName?: string;
  content: string;
  type: string;
};

export const chatStore = create(
  combine(
    {
      messages: [] as Message[],
    },
    (set) => ({
      set,
      addMessage: (m: Message) =>
        set((state) => ({ messages: [...state.messages, { ...m }] })),
      clearMessages: () => set(() => ({ messages: [] })),
    })
  )
);
