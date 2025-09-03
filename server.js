require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mysql = require("mysql2/promise");
const cors = require("cors");
const Fuse = require("fuse.js");

const { callGeminiAPI } = require("./utils/gemini"); // Actually using Mistral API
const {
  extractEntitiesFromMessage,
  buildSmartContext,
  buildPrompt,
} = require("./utils/context");
// const { saveChatHistory, getChatHistory } = require("./utils/redis"); // Tạm thời tắt Redis

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:8080",
    ],
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Cấu hình database connection
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl:
    process.env.DB_SSL === "true"
      ? {
          rejectUnauthorized: false,
        }
      : false,
};

const pool = mysql.createPool(dbConfig);

// Test database connection
pool
  .getConnection()
  .then((connection) => {
    console.log("✅ Connected to Aiven MySQL database");
    connection.release();
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    console.error("Please check your database configuration in .env file");
  });

// API endpoint để lấy sân bay
app.get("/api/airports", async (req, res) => {
  try {
    const { cityName } = req.query;
    console.log("🔍 Searching airports for city:", cityName);

    let query = "SELECT * FROM airports WHERE is_deleted = false";
    let params = [];

    if (cityName) {
      query += " AND LOWER(city_name) LIKE LOWER(?)";
      params.push(`%${cityName}%`);
    }

    console.log("Executing query:", query, "with params:", params);

    const [rows] = await pool.execute(query, params);
    console.log(`✅ Found ${rows.length} airports`);

    res.json(rows);
  } catch (error) {
    console.error("❌ Database error in /api/airports:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// API endpoint để lấy chuyến bay
app.get("/api/flights", async (req, res) => {
  try {
    const { departureCity, arrivalCity, date } = req.query;
    console.log("🔍 Searching flights:", { departureCity, arrivalCity, date });

    let query = `
      SELECT
        f.flight_id,
        f.flight_number,
        f.departure_time,
        f.arrival_time,
        f.duration,
        f.base_price,
        f.available_seats,
        f.status,
        f.stops,
        f.type,
        da.airport_name as departure_airport_name,
        da.airport_code as departure_airport_code,
        da.city_name as departure_city,
        aa.airport_name as arrival_airport_name,
        aa.airport_code as arrival_airport_code,
        aa.city_name as arrival_city,
        al.airline_name,
        al.airline_code
      FROM flights f
      LEFT JOIN airports da ON f.departure_airport_id = da.airport_id
      LEFT JOIN airports aa ON f.arrival_airport_id = aa.airport_id
      LEFT JOIN airlines al ON f.airline_id = al.airline_id
      WHERE 1=1
    `;
    let params = [];

    if (departureCity) {
      query += " AND LOWER(da.city_name) LIKE LOWER(?)";
      params.push(`%${departureCity}%`);
    }

    if (arrivalCity) {
      query += " AND LOWER(aa.city_name) LIKE LOWER(?)";
      params.push(`%${arrivalCity}%`);
    }

    if (date) {
      query += " AND DATE(f.departure_time) = ?";
      params.push(date);
    }

    query += " ORDER BY f.departure_time ASC LIMIT 20";

    console.log("📝 Final query:", query);
    console.log("📝 Query params:", params);

    const [rows] = await pool.execute(query, params);
    console.log(`✅ Found ${rows.length} flights`);

    // Debug: Nếu không tìm thấy flights, kiểm tra database
    if (rows.length === 0) {
      console.log("No flights found, checking database structure...");

      // Kiểm tra tất cả flights
      const [allFlights] = await pool.execute(`
        SELECT
          f.flight_number,
          da.city_name as departure_city,
          aa.city_name as arrival_city,
          f.departure_time
        FROM flights f
        LEFT JOIN airports da ON f.departure_airport_id = da.airport_id
        LEFT JOIN airports aa ON f.arrival_airport_id = aa.airport_id
        LIMIT 5
      `);
      console.log("Sample flights in database:", allFlights);

      // Kiểm tra airports
      const [airports] = await pool.execute(
        "SELECT airport_id, city_name FROM airports LIMIT 5"
      );
      console.log("Sample airports:", airports);
    }

    res.json(rows);
  } catch (error) {
    console.error("❌ Database error in /api/flights:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// API endpoint để lấy blog
app.get("/api/blogs", async (req, res) => {
  try {
    console.log("🔍 Fetching blogs");

    const query = `
      SELECT blog_id, title, content, slug, created_at, updated_at, published_date
      FROM blogs
      WHERE is_published = true
      ORDER BY published_date DESC
      LIMIT 10
    `;

    console.log("Executing blogs query:", query);

    const [rows] = await pool.execute(query);
    console.log(`✅ Found ${rows.length} blogs`);

    res.json(rows);
  } catch (error) {
    console.error("❌ Database error in /api/blogs:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// Socket.io xử lý chat
io.on("connection", async (socket) => {
  console.log("👤 User connected:", socket.id);
  const userId = socket.id;

  // Gửi lịch sử chat trống (tạm thời)
  socket.emit("chat_history", []);

  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`👤 User ${userId} joined room`);
  });

  socket.on("chat_message", async (data) => {
    const { userId, message } = data;
    console.log(`💬 Message from ${userId}:`, message);

    try {
      // Xử lý tin nhắn với AI
      const entities = await extractEntitiesFromMessage(message);
      const context = await buildSmartContext(userId, message, pool, entities);
      const prompt = buildPrompt(message, context, entities);
      const aiResponse = await callGeminiAPI(prompt);

      console.log("🤖 AI Response:", aiResponse);

      // Gửi response về client
      socket.emit("chat_response", {
        message: aiResponse,
        context: context, // Gửi structured context
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("❌ Error processing message:", error);
      socket.emit("chat_response", {
        message: "Xin lỗi, có lỗi xảy ra khi xử lý tin nhắn của bạn.",
        context: {
          type: "error",
          message: "Xin lỗi, có lỗi xảy ra khi xử lý tin nhắn của bạn.",
        },
        timestamp: new Date(),
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("👤 User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Chatbot server running on port ${PORT}`);
});
