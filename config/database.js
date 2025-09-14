// config/database.js
const mysql = require("mysql2/promise");

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

// Create pool with mysql2/promise
const pool = mysql.createPool(dbConfig);

// Test connection
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Connected to Aiven MySQL database");
    connection.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    console.error("Please check your database configuration in .env file");
  }
})();

module.exports = pool;
