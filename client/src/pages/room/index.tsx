import { useState, useEffect, useRef } from "react";
import { useParams, useHistory, Link } from "react-router-dom";
import shortid from "shortid";
import ReactTooltip from "react-tooltip";

import RoomClient from "../../lib/RoomClient";
import { deviceInfo } from "../../lib/deviceInfo";
import { randomPepe } from "../../lib/pepe";
import { roomStore } from "../../stores/roomStore";
import { meStore } from "../../stores/meStore";

import MessageList from "../../components/Chat/MessageList";
import MessageInput from "../../components/Chat/MessageInput";

import "./room.scss";
import PepeHouseLogo from "../../static/images/pepe.png";
import { consumersStore } from "../../stores/consumersStore";

type RoomParam = {
  roomID: string;
};

const Room = () => {
  const [newDisplayName, setNewDisplayName] = useState("");
  const [modal, setModal] = useState(false);
  const [roomClient, setRoomClient] = useState<RoomClient | null>(null);
  const history = useHistory();
  const userVideo = useRef<any>(null);
  const { roomID } = useParams<RoomParam>();
  const setRoom = roomStore((x) => x.setRoom);
  const { displayName } = meStore((state) => state);
  const { consumers } = consumersStore((state) => state);

  useEffect(() => {
    if (!roomID) {
      redirect();
    }
    function redirect() {
      history.push(`/`);
    }
  }, []);

  useEffect(() => {
    if (roomID) {
      initRoom();
    }
    function initRoom() {
      setRoom((cr) => ({ ...cr, url: window.location.href }));
      const device = deviceInfo();
      const peerId = shortid.generate();
      const displayName = randomPepe();
      meStore.getState().set({ peerId, displayName });

      console.log("creating new room client");

      const newRoomClient = new RoomClient({
        roomId: roomID,
        peerId,
        displayName, // TODO: create display name thing
        device,
        produce: false,
        consume: true,
      });
      setRoomClient(newRoomClient);
      newRoomClient.join();
    }
  }, [roomID]);

  useEffect(() => {
    if (Object.keys(consumers).length !== 0) {
      const stream = new MediaStream();
      for (const consumer in consumers) {
        if (consumers[consumer].consumer.kind === "video") {
          stream.addTrack(consumers[consumer]!.consumer!.track);
        }
        if (consumers[consumer].consumer.kind === "audio") {
          stream.addTrack(consumers[consumer]!.consumer!.track);
        }
      }
      userVideo.current.srcObject = stream;
    } else {
      console.log("no track :c");
    }
  }, [Object.keys(consumers).length]);

  useEffect(() => {
    return () => {
      if (roomClient) roomClient.close();
    };
  }, []);

  const VideoContent = () => {
    if (Object.keys(consumers).length !== 0) {
      return (
        <video className="video" controls autoPlay ref={userVideo}></video>
      );
    } else {
      return (
        <div className="video not-sharing" ref={userVideo}>
          <h1 className="title is-2">Host is currently not sharing</h1>
        </div>
      );
    }
  };

  function updateDisplayName() {
    roomClient!.changeDisplayName(newDisplayName);
    setNewDisplayName("");
    setModal(false);
  }

  return (
    <div className="host-view">
      <VideoContent />
      <div className="side-bar">
        <div className="menu">
          <Link className="side-bar-header" to="/">
            <img
              className="side-bar-header-image"
              src={PepeHouseLogo}
              alt="PepeHouse Logo"
            />
            <h1 className="side-bar-header-title title is-4">PepeHouse</h1>
          </Link>
          <p
            className="subtitle is-5 roomID"
            onClick={() => {
              const roomURL = `https://${window.location.hostname}/room/${roomID}`;
              navigator.clipboard.writeText(roomURL);
            }}
            data-tip
            data-for="room-link"
          >
            Room ID: {roomID}
          </p>
          <ReactTooltip
            id="room-link"
            type="error"
            textColor="#fff"
            backgroundColor="hsl(171, 100%, 41%)"
            effect="solid"
            place="left"
          >
            <p className="subtitle is-6 tool-tip">Click to get shareable url</p>
          </ReactTooltip>
          <p
            className="subtitle is-5 display-name"
            onClick={() => setModal(true)}
            data-tip
            data-for="display-name"
          >
            Display name: <strong>{displayName}</strong>
          </p>
          <ReactTooltip
            id="display-name"
            type="error"
            textColor="#fff"
            backgroundColor="hsl(171, 100%, 41%)"
            effect="solid"
            place="left"
          >
            <p className="subtitle is-6 tool-tip">Click to change name</p>
          </ReactTooltip>
        </div>
        {roomClient ? (
          <div className="chat-container">
            <MessageList />
            <MessageInput roomClient={roomClient} />
          </div>
        ) : null}
      </div>
      <div className={`modal ${modal ? "is-active" : null}`}>
        <div className="modal-background" onClick={() => setModal(false)}></div>
        <div className="modal-content">
          <div className="box display-name-box">
            <div className="field">
              <label className="label">Display name</label>
              <div className="control">
                <input
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  value={newDisplayName}
                  className="input"
                  type="email"
                  placeholder="Y No Like Pepo"
                />
              </div>
            </div>
            <button onClick={updateDisplayName} className="button is-primary">
              Submit
            </button>
          </div>
        </div>
        <button
          onClick={() => setModal(false)}
          className="modal-close is-large"
          aria-label="close"
        ></button>
      </div>
    </div>
  );
};

export default Room;
