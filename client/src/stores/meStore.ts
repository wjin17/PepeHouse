import create from "zustand";
import { combine } from "zustand/middleware";
import { Device } from "mediasoup-client";
import { detectDevice } from "mediasoup-client/lib/types";

export const getDevice = () => {
  try {
    let handlerName = detectDevice();
    if (!handlerName) {
      console.warn(
        "mediasoup does not recognize this device, so been has defaulted it to Chrome74"
      );
      handlerName = "Chrome74";
    }
    return new Device({ handlerName });
  } catch {
    return null;
  }
};

export const meStore = create(
  combine(
    {
      peerId: null as string | null,
      displayName: null as string | null,
      displayNameSet: true as boolean,
      device: getDevice(),
      shareInProgress: false as boolean,
      restartIceInProgress: false as boolean,
      error: null as string | null,
    },
    (set) => ({
      nullify: () =>
        set({
          peerId: null,
          displayName: null,
          displayNameSet: true,
          shareInProgress: false,
          restartIceInProgress: false,
          error: null,
        }),
      set,
    })
  )
);
