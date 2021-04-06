import express from "express";
import http from "http";
import { Server } from "socket.io";
import { config } from "./config";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms: any = {};

/* app.get("/test", (req, res) => {
  res.send("Hello World!");
}); */
io.on("connection", (socket) => {
  console.log("socket connected", socket);
  socket.on("join room", (roomID) => {
    console.log("joined room", roomID);
    if (rooms[roomID]) {
      rooms[roomID].push(socket.id);
    } else {
      rooms[roomID] = [socket.id];
    }
    const otherUser = rooms[roomID].find((id: string) => id !== socket.id);
    if (otherUser) {
      socket.emit("other user", otherUser);
      socket.to(otherUser).emit("user joined", socket.id);
    }
  });

  socket.on("offer", (payload) => {
    io.to(payload.target).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    io.to(payload.target).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    io.to(incoming.target).emit("ice-candidate", incoming.candidate);
  });
});

const PORT = process.env.PORT || 5000;

try {
  server.listen(PORT, () => {
    console.log(`Server is up at ${PORT}`);
  });
} catch (err) {
  console.log(err);
}
