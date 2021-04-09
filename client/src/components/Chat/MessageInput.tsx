import { useState } from "react";
import RoomClient from "../../lib/RoomClient";

import "./Chat.scss";

type MessageInputProp = {
  roomClient: RoomClient;
};

const MessageInput = ({ roomClient }: MessageInputProp) => {
  const [message, setMessage] = useState("");
  const [chatEnabled, setChatEnabled] = useState(false);

  function submitMessage(e: any) {
    e.preventDefault();
    if (!chatEnabled) {
      roomClient.enableChatDataProducer();
      setChatEnabled(true);
    }
    roomClient.sendChatMessage(message);
    setMessage("");
  }

  return (
    <form className="message-input">
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="input is-rounded chat-input"
        type="text"
        placeholder="Chat"
      />
      <button
        type="submit"
        className="button is-primary is-rounded chat-submit"
        onClick={submitMessage}
      >
        Send
      </button>
    </form>
  );
};

export default MessageInput;
