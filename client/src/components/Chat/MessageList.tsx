import { useRef, useEffect } from "react";

import { chatStore } from "../../stores/chatStore";
import { dummy } from "../../lib/dummyChat";

import "./Chat.scss";

const MessageList = () => {
  const { messages } = chatStore((state) => state);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    //@ts-ignore
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <ul className="message-list">
      {messages.map((message, index) => {
        if (message.type === "chat") {
          return (
            <li className="chat" key={index}>
              <p className="subtitle is-6">
                <strong className="chat_display-name">{`${message.displayName}`}</strong>
                : {`${message.content}`}
              </p>
            </li>
          );
        } else if (message.type === "notification") {
          return (
            <li className="chat" key={index}>
              <p className="subtitle is-6 ">
                <strong className="chat_notification">{`${message.content}`}</strong>
              </p>
            </li>
          );
        }
      })}
      <div ref={messagesEndRef} />
    </ul>
  );
};

export default MessageList;
