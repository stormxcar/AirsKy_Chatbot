const Fuse = require("fuse.js");
const { callAPI } = require("./api");
const queries = require("./queries");
const config = require("./config");
const { airportCache } = require("./cache");

// Hàm extract entities dùng Mistral
async function extractEntitiesFromMessage(message) {
  console.log("🔍 Original message:", message);

  const extractPrompt = config.EXTRACT_ENTITIES_PROMPT.replace(
    "{message}",
    message
  );

  try {
    const response = await callGeminiAPI(extractPrompt); // Actually using Mistral API
    console.log("🤖 Mistral raw response:", response);
    const jsonMatch = response.match(/\{.*\}/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("🤖 Parsed entities:", parsed);
      return parsed;
    } else {
      console.warn(
        "⚠️ No JSON found in Mistral response, using simple fallback"
      );
      // Simple fallback: chỉ extract date, để database search handle cities
      return {
        departure: null,
        arrival: null,
        date: extractDate(message),
      };
    }
  } catch (error) {
    console.error("❌ Error extracting entities:", error.message);
    // Simple fallback
    return {
      departure: null,
      arrival: null,
      date: extractDate(message),
    };
  }
}

// Hàm trích xuất ngày từ tin nhắn
function extractDate(message) {
  console.log("🔍 Extracting date from message:", message);

  for (const { pattern, type } of config.DATE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      console.log("📅 Date pattern matched:", pattern.source);
      console.log("📅 Match result:", match);
      let day, month, year;

      if (type === "full" || type === "text_full") {
        [day, month, year] = match.slice(1).map(Number);
      } else if (type === "short" || type === "text_short") {
        [day, month] = match.slice(1).map(Number);
        year = new Date().getFullYear();
      } else if (type === "today") {
        const today = new Date();
        day = today.getDate();
        month = today.getMonth() + 1;
        year = today.getFullYear();
      } else if (type === "tomorrow") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        day = tomorrow.getDate();
        month = tomorrow.getMonth() + 1;
        year = tomorrow.getFullYear();
      } else if (type === "day_after") {
        const dayAfter = new Date();
        dayAfter.setDate(dayAfter.getDate() + 2);
        day = dayAfter.getDate();
        month = dayAfter.getMonth() + 1;
        year = dayAfter.getFullYear();
      }

      const date = new Date(year, month - 1, day);
      if (isNaN(date.getTime()) || date.getFullYear() !== year) {
        console.warn("⚠️ Invalid date:", { day, month, year });
        return null;
      }

      day = day.toString().padStart(2, "0");
      month = month.toString().padStart(2, "0");
      const result = `${year}-${month}-${day}`;
      console.log("📅 Final extracted date:", result);
      return result;
    }
  }

  console.log("📅 No date pattern matched, returning null");
  return null;
}

// Hàm trích xuất thành phố (dựa hoàn toàn vào database search)
async function extractCities(message, dbPool, entities) {
  if (entities.departure || entities.arrival) {
    // Nếu entities có giá trị từ Mistral, không cần extractCities
    console.log("🔍 Skipping extractCities, using Mistral entities directly");
    return [];
  }

  console.log("🔍 Extracting cities from message using database:", message);

  // Tách từ khóa từ message, loại bỏ stop words
  const keywords = message
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1) // Giảm xuống 1 để catch được mã sân bay 3 ký tự
    .filter((word) => !config.STOP_WORDS.includes(word));

  console.log("🔍 Filtered keywords:", keywords);

  const foundCities = new Set();

  try {
    if (!airportCache.has("airports")) {
      console.log("📋 Fetching airports for cache...");
      const [allAirports] = await dbPool.execute(queries.getAirportsList);
      airportCache.set("airports", allAirports);
      console.log("📋 Airport cache loaded:", allAirports.length, "items");
    }

    const cachedAirports = airportCache.get("airports");
    if (!cachedAirports || cachedAirports.length === 0) {
      console.warn("⚠️ No airports found in database");
      return [];
    }

    const fuse = new Fuse(cachedAirports, config.FUSE_OPTIONS);

    // Thử tìm với từng keyword
    for (const keyword of keywords) {
      console.log("🔍 Searching for keyword:", keyword);
      const results = fuse.search(keyword);

      // Lọc kết quả tốt (score < 0.4)
      const goodResults = results.filter((result) => result.score < 0.4);

      console.log("🔍 Good results for", keyword, ":", goodResults.slice(0, 3));

      goodResults.slice(0, 2).forEach((result) => {
        if (result.item && result.item.city_name) {
          const cleanCity = result.item.city_name
            .toLowerCase()
            .split(",")[0]
            .trim();
          foundCities.add(cleanCity);
          console.log("🔍 Added city:", cleanCity, "from keyword:", keyword);
        }
      });
    }

    const result = Array.from(foundCities);
    console.log("🔍 Final extracted cities:", result);
    return result;
  } catch (error) {
    console.error("❌ Error extracting cities:", error.message);
    return [];
  }
}

module.exports = {
  extractEntitiesFromMessage,
  extractCities,
  extractDate,
};
