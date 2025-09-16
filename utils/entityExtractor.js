const Fuse = require("fuse.js");
const { callAPI } = require("./api");
const { getLangChainSQLManager } = require("./langchainSQL");
const { airportCache } = require("./cache");

// Hard-coded configurations (minimal, essential only)
const FUSE_OPTIONS = {
  keys: ["city_name", "airport_name", "airport_code"],
  threshold: 0.4,
  includeScore: true,
};

const STOP_WORDS = [
  "từ",
  "đi",
  "đến",
  "sân",
  "bay",
  "chuyến",
  "ngày",
  "tháng",
  "năm",
  "và",
  "có",
  "không",
  "là",
  "mình",
  "tôi",
  "bạn",
  "muốn",
  "cần",
  "tìm",
  "xem",
  "các",
  "một",
  "vào",
  "ra",
  "về",
  "ở",
];

const DATE_PATTERNS = [
  { pattern: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, type: "full" },
  { pattern: /(\d{1,2})\/(\d{1,2})/, type: "short" },
  {
    pattern: /(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/,
    type: "text_full",
  },
  { pattern: /(\d{1,2})\s*tháng\s*(\d{1,2})/, type: "text_short" },
  { pattern: /hôm\s*nay/, type: "today" },
  { pattern: /ngày\s*mai/, type: "tomorrow" },
  { pattern: /ngày\s*mốt/, type: "day_after" },
];

const EXTRACT_ENTITIES_PROMPT = `
  Trích xuất thông tin từ tin nhắn sau bằng tiếng Việt:
  - Departure city/airport (thành phố/sân bay đi)
  - Arrival city/airport (thành phố/sân bay đến)
  - Date (ngày bay đi, format YYYY-MM-DD, bao gồm cả năm nếu có trong tin nhắn)
  - Return date (ngày bay về cho vé khứ hồi, format YYYY-MM-DD, null nếu không có)
  - Trip type (loại chuyến bay: "ONE_WAY" cho một chiều, "ROUND_TRIP" cho khứ hồi, "MULTI_CITY" cho đa thành phố)
  - Stops (điểm dừng trung gian, array of cities/airports, null nếu không có)

  Tin nhắn: "{message}"

  HƯỚNG DẪN CHI TIẾT:
  - TÌM THÀNH PHỐ/SÂN BAY: Tìm từ khóa như "từ", "đi", "đến", "sân bay", tên thành phố Việt Nam
  - TÌM ĐIỂM DỪNG: Tìm từ khóa như "có điểm dừng", "dừng ở", "qua", "trung chuyển", "stop", "layover"
  - VÍ DỤ: "từ Hà Nội đi Đà Nẵng" → departure: "Hà Nội", arrival: "Đà Nẵng", trip_type: "ONE_WAY", stops: null
  - VÍ DỤ: "SGN đến HAN" → departure: "SGN", arrival: "HAN", trip_type: "ONE_WAY", stops: null
  - VÍ DỤ: "khứ hồi từ Sài Gòn ra Hà Nội" → trip_type: "ROUND_TRIP", stops: null
  - VÍ DỤ: "đi về từ Đà Nẵng ngày 1/6 về 5/6" → date: "2025-06-01", return_date: "2025-06-05", trip_type: "ROUND_TRIP", stops: null
  - VÍ DỤ: "chuyến bay ngày 1/6" → date: "2025-06-01", trip_type: "ONE_WAY", stops: null
  - VÍ DỤ: "từ Hà Nội đến Đà Nẵng có điểm dừng ở Phú Yên" → departure: "Hà Nội", arrival: "Đà Nẵng", stops: ["Phú Yên"], trip_type: "MULTI_CITY"
  - VÍ DỤ: "Hanoi to Tokyo via Seoul" → departure: "Hanoi", arrival: "Tokyo", stops: ["Seoul"], trip_type: "MULTI_CITY"
  - VÍ DỤ: "chuyến bay qua Dubai" → stops: ["Dubai"], trip_type: "MULTI_CITY"
  - TỪ KHÓA KHỨ HỒI: "khứ hồi", "đi về", "round trip", "return", "về lại", "quay lại"
  - TỪ KHÓA ĐA THÀNH PHỐ: "đa thành phố", "multi-city", "connecting", "có điểm dừng", "dừng ở", "qua", "trung chuyển"
  - Nếu có từ khóa đa thành phố hoặc điểm dừng → trip_type: "MULTI_CITY"
  - Nếu có từ khóa khứ hồi → trip_type: "ROUND_TRIP"
  - Nếu không có từ khóa đặc biệt → trip_type: "ONE_WAY"
  - Nếu không có thông tin, trả về null

  Trả lời CHỈ JSON, không có text khác: { "departure": "string|null", "arrival": "string|null", "date": "YYYY-MM-DD|null", "return_date": "YYYY-MM-DD|null", "trip_type": "ONE_WAY|ROUND_TRIP|MULTI_CITY", "stops": "array|null" }
`;

// Hàm extract entities dùng Mistral
async function extractEntitiesFromMessage(message) {
  console.log("🔍 Original message:", message);

  const extractPrompt = EXTRACT_ENTITIES_PROMPT.replace("{message}", message);

  try {
    const response = await callAPI(extractPrompt); // Actually using Mistral API
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
      // Enhanced fallback: extract basic entities from message
      return simpleExtractEntities(message);
    }
  } catch (error) {
    console.error("❌ Error extracting entities:", error);
    // Enhanced fallback: extract basic entities from message
    return simpleExtractEntities(message);
  }
}

/**
 * Simple entity extraction fallback when API is not available
 * @param {string} message - User message
 * @returns {Object} Extracted entities
 */
function simpleExtractEntities(message) {
  console.log("🔄 Using simple entity extraction fallback");

  const lowerMessage = message.toLowerCase();
  let entities = {
    departure: null,
    arrival: null,
    date: extractDateFromMessage(message),
    return_date: null,
    trip_type: "ONE_WAY",
    stops: null,
  };

  // Extract departure and arrival cities using simple string operations
  // Look for "từ" and extract city after it
  const tuIndex = message.toLowerCase().indexOf("từ");
  if (tuIndex !== -1) {
    const afterTu = message.substring(tuIndex + 3).trim(); // Skip "từ" and space

    // Find the next keyword to determine where departure city ends
    const keywordPattern = /(đến|đi|sang|qua|ra|có)/i;
    const keywordMatch = afterTu.match(keywordPattern);

    if (keywordMatch) {
      const keywordIndex = keywordMatch.index;
      entities.departure = afterTu.substring(0, keywordIndex).trim();
      console.log(`📍 Extracted departure: ${entities.departure}`);

      // Extract arrival from after the keyword
      const afterKeyword = afterTu
        .substring(keywordIndex + keywordMatch[0].length)
        .trim();

      // Find next keyword or end of string for arrival
      const nextKeywordMatch = afterKeyword.match(/(có|ngày|tháng|năm)/i);
      if (nextKeywordMatch) {
        entities.arrival = afterKeyword
          .substring(0, nextKeywordMatch.index)
          .trim();
      } else {
        // Take first few words as arrival
        const words = afterKeyword.split(/\s+/);
        entities.arrival = words.slice(0, 3).join(" "); // Take up to 3 words
      }

      console.log(
        `📍 Extracted route: ${entities.departure} → ${entities.arrival}`
      );
    }
  }

  // Check for multi-city keywords
  const multiCityKeywords = [
    "có điểm dừng",
    "dừng ở",
    "qua",
    "trung chuyển",
    "stop",
    "layover",
    "connecting",
    "đa thành phố",
    "multi-city",
  ];

  const hasMultiCityKeyword = multiCityKeywords.some((keyword) =>
    lowerMessage.includes(keyword.toLowerCase())
  );

  if (hasMultiCityKeyword) {
    entities.trip_type = "MULTI_CITY";
    console.log("🎯 Detected multi-city trip type");

    // Extract stops using improved patterns
    // Pattern: "có điểm dừng ở [stop]" or "dừng ở [stop]" or "qua [stop]"
    const stopPatterns = [
      /có điểm dừng ở\s+(.+)$/i,
      /dừng ở\s+(.+)$/i,
      /qua\s+(.+)$/i,
      /trung chuyển tại\s+(.+)$/i,
      /stop at\s+(.+)$/i,
    ];

    for (const pattern of stopPatterns) {
      const stopMatch = message.match(pattern);
      if (stopMatch) {
        // Take first 2-3 words as the stop city
        const stopText = stopMatch[1].trim();
        const words = stopText.split(/\s+/);
        entities.stops = [words.slice(0, 3).join(" ")]; // Take up to 3 words
        console.log(`🛑 Extracted stop: ${entities.stops[0]}`);
        break;
      }
    }
  }

  // Check for round-trip keywords
  const roundTripKeywords = [
    "khứ hồi",
    "đi về",
    "round trip",
    "return",
    "về lại",
    "quay lại",
  ];

  const hasRoundTripKeyword = roundTripKeywords.some((keyword) =>
    lowerMessage.includes(keyword.toLowerCase())
  );

  if (hasRoundTripKeyword) {
    entities.trip_type = "ROUND_TRIP";
    console.log("🔄 Detected round-trip trip type");
  }

  console.log("✅ Simple extraction result:", entities);
  return entities;
}

/**
 * Extract date from message using patterns
 * @param {string} message - User message
 * @returns {string|null} Date in YYYY-MM-DD format or null
 */
function extractDateFromMessage(message) {
  for (const { pattern, type } of DATE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      switch (type) {
        case "full":
          return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(
            2,
            "0"
          )}`;
        case "short":
          return `2025-${match[2].padStart(2, "0")}-${match[1].padStart(
            2,
            "0"
          )}`;
        case "text_full":
          return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(
            2,
            "0"
          )}`;
        case "text_short":
          return `2025-${match[2].padStart(2, "0")}-${match[1].padStart(
            2,
            "0"
          )}`;
        case "today":
          const today = new Date();
          return today.toISOString().split("T")[0];
        case "tomorrow":
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          return tomorrow.toISOString().split("T")[0];
        case "day_after":
          const dayAfter = new Date();
          dayAfter.setDate(dayAfter.getDate() + 2);
          return dayAfter.toISOString().split("T")[0];
      }
    }
  }
  return null;
}

/**
 * Search for airports using fuzzy matching
 * @param {string} query - Search query
 * @returns {Array} Matching airports
 */
async function searchAirports(query) {
  try {
    // Get cached airports or fetch from database
    const airports = await airportCache.getAirports();

    // Create Fuse instance for fuzzy search
    const fuse = new Fuse(airports, FUSE_OPTIONS);

    // Search with fuzzy matching
    const results = fuse.search(query);

    // Return top matches with score filtering
    return results
      .filter((result) => result.score < 0.6) // Only high-confidence matches
      .slice(0, 5) // Limit to top 5
      .map((result) => result.item);
  } catch (error) {
    console.error("❌ Error searching airports:", error);
    return [];
  }
}

/**
 * Process extracted entities and enhance with airport data
 * @param {Object} entities - Raw extracted entities
 * @param {string} originalMessage - Original user message
 * @returns {Object} Processed entities with airport information
 */
async function processEntities(entities, originalMessage) {
  const processed = { ...entities };

  // Process departure city/airport
  if (processed.departure) {
    const departureAirports = await searchAirports(processed.departure);
    if (departureAirports.length > 0) {
      processed.departureAirport = departureAirports[0];
    }
  }

  // Process arrival city/airport
  if (processed.arrival) {
    const arrivalAirports = await searchAirports(processed.arrival);
    if (arrivalAirports.length > 0) {
      processed.arrivalAirport = arrivalAirports[0];
    }
  }

  // Process stops if any
  if (processed.stops && Array.isArray(processed.stops)) {
    processed.processedStops = [];
    for (const stop of processed.stops) {
      const stopAirports = await searchAirports(stop);
      if (stopAirports.length > 0) {
        processed.processedStops.push({
          city: stop,
          airport: stopAirports[0],
        });
      }
    }
  }

  return processed;
}

module.exports = {
  extractEntitiesFromMessage,
  searchAirports,
  processEntities,
  extractDateFromMessage,
  simpleExtractEntities,
};
