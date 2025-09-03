const { createClient } = require("redis");

// Kết nối Redis
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

let redisConnected = false;

redisClient.on("error", (err) => {
  console.error("Redis Client Error", err);
  redisConnected = false;
});

redisClient.on("connect", () => {
  console.log("Connected to Redis");
  redisConnected = true;
});

redisClient.connect().catch(() => {
  console.log("Redis not available, chat history will not be saved");
});

// Hàm lưu lịch sử chat vào Redis (chỉ nếu kết nối được)
async function saveChatHistory(userId, message) {
  if (!redisConnected) return;
  try {
    const history = (await redisClient.get(`chat:${userId}`)) || "[]";
    const messages = JSON.parse(history);
    messages.push(message);
    await redisClient.set(`chat:${userId}`, JSON.stringify(messages));
  } catch (error) {
    console.error("Error saving chat history:", error);
  }
}

// Hàm lấy lịch sử chat từ Redis (chỉ nếu kết nối được)
async function getChatHistory(userId) {
  if (!redisConnected) return [];
  try {
    const history = (await redisClient.get(`chat:${userId}`)) || "[]";
    return JSON.parse(history);
  } catch (error) {
    console.error("Error getting chat history:", error);
    return [];
  }
}

module.exports = {
  redisClient,
  saveChatHistory,
  getChatHistory,
  redisConnected,
};
