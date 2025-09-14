require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// Import configurations
const serverConfig = require("./config/server");
const dbConfig = require("./config/database");

// Import services
const { initializeSocketHandlers } = require("./services/chatService");

// Import utils
const logger = require("./utils/logger");

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: serverConfig.CORS_ORIGINS,
    methods: serverConfig.SOCKET_METHODS,
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from root directory
app.use(express.static("."));

// Test page route
app.get("/test", (req, res) => {
  res.sendFile(__dirname + "/test.html");
});

// Initialize socket handlers
initializeSocketHandlers(io, dbConfig);

// Start server
const PORT = serverConfig.PORT;
server.listen(PORT, () => {
  logger.info(`🚀 AirsKy Chatbot Server running on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);
});
