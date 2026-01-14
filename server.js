// ------------------------------
// Coffee Game WebRTC Signaling Server
// No env, no secrets, no config files
// ------------------------------

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Allow all origins (safe for signaling)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// In-memory rooms (no database needed)
const rooms = {};

// Health check
app.get("/", (req, res) => {
    res.send("Coffee Game signaling server is running.");
});

// When a client connects
io.on("connection", socket => {
    console.log("Client connected:", socket.id);

    // Host creates a room
    socket.on("host", roomId => {
        socket.join(roomId);
        rooms[roomId] = { host: socket.id, joiner: null };
        console.log(`Host created room ${roomId}`);
        io.to(socket.id).emit("host-ready");
    });

    // Joiner joins a room
    socket.on("join", roomId => {
        const room = rooms[roomId];

        if (!room) {
            io.to(socket.id).emit("error", "Room does not exist");
            return;
        }
        if (room.joiner) {
            io.to(socket.id).emit("error", "Room full");
            return;
        }

        room.joiner = socket.id;
        socket.join(roomId);

        console.log(`Joiner joined room ${roomId}`);

        io.to(room.host).emit("joiner-connected");
        io.to(room.joiner).emit("join-success");
    });

    // WebRTC offer host → joiner
    socket.on("offer", ({ roomId, offer }) => {
        const joiner = rooms[roomId]?.joiner;
        if (joiner) io.to(joiner).emit("offer", offer);
    });

    // WebRTC answer joiner → host
    socket.on("answer", ({ roomId, answer }) => {
        const host = rooms[roomId]?.host;
        if (host) io.to(host).emit("answer", answer);
    });

    // ICE candidates both ways
    socket.on("ice-candidate", ({ roomId, candidate }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (socket.id === room.host && room.joiner)
            io.to(room.joiner).emit("ice-candidate", candidate);

        if (socket.id === room.joiner && room.host)
            io.to(room.host).emit("ice-candidate", candidate);
    });

    // Disconnect cleanup
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);

        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (!room) continue;

            if (room.host === socket.id || room.joiner === socket.id) {
                if (room.host) io.to(room.host).emit("peer-disconnected");
                if (room.joiner) io.to(room.joiner).emit("peer-disconnected");
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted`);
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Signaling server running on port", PORT);
});