import { useState, useEffect, useRef } from "react";
import { useParams, useHistory } from "react-router-dom";
import shortid from "shortid";

import RoomClient from "../../lib/RoomClient";
import { deviceInfo } from "../../lib/deviceInfo";
import { randomPepe } from "../../lib/pepe";
import { roomStore } from "../../stores/roomStore";
import { meStore } from "../../stores/meStore";
import { producersStore } from "../../stores/producersStore";

import "./host.scss";
import PepeHouseLogo from "../../static/images/pepe.png";

type HostParam = {
  roomID: string;
};

const Test = () => {
  const [sharingScreen, setSharingScreen] = useState(false);
  const userVideo = useRef<any>(null);
  const { roomID } = useParams<HostParam>();

  useEffect(() => {
    getUserMedia();
  }, []);

  async function getUserMedia() {
    try {
      // @ts-ignore
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "never" },
        audio: true,
      });
      setSharingScreen(true);
      const screenTrack = stream.getTracks()[0];
      console.log(screenTrack);
      const mediaStream = new MediaStream();
      mediaStream.addTrack(screenTrack);
      userVideo.current.srcObject = mediaStream;
      screenTrack.onended = () => {
        console.log("ended");
        setSharingScreen(false);
      };
    } catch (err) {
      console.log(err);
      setSharingScreen(false);
    }
  }
  const VideoContent = () => {
    //console.log("video content", shareInProgress);
    if (sharingScreen) {
      return (
        <video className="video" controls autoPlay ref={userVideo}></video>
      );
    } else {
      return (
        <div className="video not-sharing" ref={userVideo}>
          <h1 className="title is-2">Currently not sharing</h1>
        </div>
      );
    }
  };

  return (
    <div className="host-view">
      <VideoContent />
      <div className="side-bar">
        <div className="side-bar-header">
          <img
            className="side-bar-header-image"
            src={PepeHouseLogo}
            alt="PepeHouse Logo"
          />
          <h1 className="side-bar-header-title title is-4">PepeHouse</h1>
        </div>
        <p className="title is-3">Host</p>
        <p
          className="subtitle is-5 roomID"
          /* onClick={() => {
            navigator.clipboard.writeText(roomID);
          }} */
        >
          Room ID: {roomID}
        </p>
        {!sharingScreen ? (
          <button
            className="button is-primary is-rounded"
            onClick={() => {
              getUserMedia();
            }}
          >
            Share screen
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default Test;
