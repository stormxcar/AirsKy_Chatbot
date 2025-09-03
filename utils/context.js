const mysql = require("mysql2/promise");
const Fuse = require("fuse.js");
const { callGeminiAPI } = require("./gemini");
const queries = require("./queries");

// In-memory cache cho danh sách sân bay
let airportCache = null;

// Hàm extract entities dùng Mistral
async function extractEntitiesFromMessage(message) {
  console.log("🔍 Original message:", message);

  const extractPrompt = `
    Trích xuất thông tin từ tin nhắn sau bằng tiếng Việt:
    - Departure city/airport (thành phố/sân bay đi)
    - Arrival city/airport (thành phố/sân bay đến)
    - Date (ngày bay, format YYYY-MM-DD, bao gồm cả năm nếu có trong tin nhắn)

    Tin nhắn: "${message}"

    HƯỚNG DẪN CHI TIẾT:
    - TÌM THÀNH PHỐ/SÂN BAY: Tìm từ khóa như "từ", "đi", "đến", "sân bay", tên thành phố Việt Nam
    - VÍ DỤ: "từ Hà Nội đi Đà Nẵng" → departure: "Hà Nội", arrival: "Đà Nẵng"
    - VÍ DỤ: "SGN đến HAN" → departure: "SGN", arrival: "HAN"
    - VÍ DỤ: "từ sân bay cam ranh" → departure: "Cam Ranh"
    - VÍ DỤ: "đến sân bay quốc tế nội bài" → arrival: "Hà Nội"
    - VÍ DỤ: "chuyến bay ngày 1/6" → date: "2024-06-01"
    - VÍ DỤ: "tôi muốn bay từ ninh thuận" → departure: "Ninh Thuận"
    - Nếu không có thông tin, trả về null

    Trả lời CHỈ JSON, không có text khác: { "departure": "string|null", "arrival": "string|null", "date": "YYYY-MM-DD|null" }
  `;

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
  const datePatterns = [
    { pattern: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, type: "full" }, // DD/MM/YYYY
    { pattern: /(\d{1,2})\/(\d{1,2})/, type: "short" }, // DD/MM
    {
      pattern: /(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/,
      type: "text_full",
    }, // DD tháng MM năm YYYY
    { pattern: /(\d{1,2})\s*tháng\s*(\d{1,2})/, type: "text_short" }, // DD tháng MM
    { pattern: /hôm\s*nay/, type: "today" }, // hôm nay
    { pattern: /ngày\s*mai/, type: "tomorrow" }, // ngày mai
    { pattern: /ngày\s*mốt/, type: "day_after" }, // ngày mốt
  ];

  for (const { pattern, type } of datePatterns) {
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
    .filter(
      (word) =>
        ![
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
          "đi",
          "đến",
        ].includes(word)
    );

  console.log("🔍 Filtered keywords:", keywords);

  const foundCities = new Set();

  try {
    if (!airportCache) {
      console.log("📋 Fetching airports for cache...");
      const [allAirports] = await dbPool.execute(queries.getAirportsList);
      airportCache = allAirports;
      console.log("📋 Airport cache loaded:", allAirports.length, "items");
    }

    if (airportCache.length === 0) {
      console.warn("⚠️ No airports found in database");
      return [];
    }

    const fuse = new Fuse(airportCache, {
      keys: ["city_name", "airport_name", "airport_code"],
      threshold: 0.4, // Tăng để tìm kiếm linh hoạt
      includeScore: true,
    });

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

// Hàm xây dựng context
async function buildSmartContext(userId, message, dbPool, entities) {
  const lowerMessage = message.toLowerCase();
  console.log("Building context for message:", message);
  console.log("Entities from Mistral:", entities);

  const departureCity = entities.departure || null;
  const arrivalCity = entities.arrival || null;
  const extractedDate = entities.date || extractDate(message);

  console.log(
    "🔍 Before extractCities - departure:",
    departureCity,
    "arrival:",
    arrivalCity
  );

  const cities = await extractCities(message, dbPool, entities);
  console.log("🔍 Cities from extractCities:", cities);

  const searchInfo = {
    departureCity: departureCity || cities[0] || null,
    arrivalCity: arrivalCity || cities[1] || cities[0] || null,
    date: extractedDate,
  };

  console.log("🔍 Final search info:", searchInfo);

  // Danh sách tỉnh không có sân bay
  const noAirportCities = ["bình thuận", "bạc liêu"];
  const noAirportSuggestions = {
    "bình thuận": "Thử sân bay Liên Khương (Đà Lạt) hoặc Cam Ranh (Nha Trang).",
    "bạc liêu": "Thử sân bay Cần Thơ hoặc Rạch Giá.",
  };

  if (searchInfo.date || searchInfo.departureCity || searchInfo.arrivalCity) {
    // Kiểm tra tỉnh không có sân bay (chỉ khi có city được chỉ định)
    if (searchInfo.departureCity || searchInfo.arrivalCity) {
      const hasNoAirport =
        noAirportCities.includes(searchInfo.departureCity?.toLowerCase()) ||
        noAirportCities.includes(searchInfo.arrivalCity?.toLowerCase());
      if (hasNoAirport) {
        const city = noAirportCities.includes(
          searchInfo.departureCity?.toLowerCase()
        )
          ? searchInfo.departureCity
          : searchInfo.arrivalCity;
        return {
          type: "flights",
          message: `Không tìm thấy chuyến bay đến/đi từ ${city}. ${
            noAirportSuggestions[city.toLowerCase()] || "Thử sân bay gần nhất."
          }`,
          data: [],
        };
      }
    }

    try {
      const queryParams = [
        searchInfo.departureCity || null,
        searchInfo.departureCity ? `%${searchInfo.departureCity}%` : null,
        searchInfo.departureCity ? `%${searchInfo.departureCity}%` : null,
        searchInfo.departureCity || null,
        searchInfo.arrivalCity || null,
        searchInfo.arrivalCity ? `%${searchInfo.arrivalCity}%` : null,
        searchInfo.arrivalCity ? `%${searchInfo.arrivalCity}%` : null,
        searchInfo.arrivalCity || null,
        searchInfo.date || null,
        searchInfo.date || null,
      ];

      console.log("📝 Query params:", queryParams);

      const [rows] = await dbPool.execute(queries.searchFlights, queryParams);
      console.log("✈️ Flights found:", rows.length, "items");

      const flights = rows.map((flight) => ({
        flightNumber: flight.flight_number || "N/A",
        airline: flight.airline_name || "Unknown Airline",
        departure: flight.departure_city_name || "N/A",
        arrival: flight.arrival_city_name || "N/A",
        departureTime: flight.departure_time
          ? new Date(flight.departure_time).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        arrivalTime: flight.arrival_time
          ? new Date(flight.arrival_time).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        duration: flight.duration
          ? `${Math.floor(flight.duration / 60)}h ${flight.duration % 60}m`
          : "N/A",
        price: flight.base_price
          ? `${flight.base_price.toLocaleString("vi-VN")} ₫`
          : "N/A",
        seats:
          flight.available_seats != null
            ? flight.available_seats.toString()
            : "N/A",
        status: flight.status || "ON_TIME",
        date: flight.departure_time
          ? new Date(flight.departure_time).toLocaleDateString("vi-VN")
          : "N/A",
      }));

      return {
        type: "flights",
        message:
          flights.length > 0
            ? searchInfo.departureCity || searchInfo.arrivalCity
              ? "CÁC CHUYẾN BAY PHÙ HỢP:"
              : `CÁC CHUYẾN BAY VÀO NGÀY ${
                  searchInfo.date
                    ? new Date(searchInfo.date).toLocaleDateString("vi-VN")
                    : "được chọn"
                }:`
            : "Không tìm thấy chuyến bay phù hợp.",
        data: flights,
      };
    } catch (error) {
      console.error("❌ Error fetching flights:", error.message);
      return {
        type: "flights",
        message: "Không thể tìm kiếm chuyến bay. Vui lòng thử lại sau.",
        data: [],
      };
    }
  } else if (
    lowerMessage.includes("sân bay") ||
    lowerMessage.includes("airport")
  ) {
    try {
      console.log("📋 Fetching airports list...");
      const [rows] = await dbPool.execute(queries.getAirportsList);
      console.log("📋 Airports found:", rows.length, "items");

      const airports = rows.map((airport) => ({
        name: airport.airport_name || "N/A",
        code: airport.airport_code || "N/A",
        city: airport.city_name || "N/A",
      }));

      return {
        type: "airports",
        message: "DANH SÁCH SÂN BAY:",
        data: airports,
      };
    } catch (error) {
      console.error("❌ Error fetching airports:", error.message);
      return {
        type: "airports",
        message: "Không thể tải dữ liệu sân bay.",
        data: [],
      };
    }
  }

  return {
    type: "text",
    message: "Vui lòng cung cấp thông tin thành phố hoặc sân bay để tìm kiếm.",
    data: [],
  };
}

// Hàm xây dựng prompt
function buildPrompt(message, context, entities = {}) {
  if (context.type === "text") {
    const dateStr = entities.date
      ? new Date(entities.date).toLocaleDateString("vi-VN")
      : "đó";
    return `Bạn là trợ lý AI của AirSky. Người dùng hỏi: "${message}"

Thông tin hiện có: ${context.message}

Hãy trả lời trực tiếp bằng tiếng Việt, bắt đầu bằng "Chào bạn!", giải thích rằng để tìm chuyến bay cần biết thành phố đi và đến, và hỏi cụ thể: "Bạn muốn bay từ thành phố nào đến thành phố nào vào ngày ${dateStr}?"`;
  }

  let contextText = "";

  if (context.type === "flights") {
    contextText = `${context.message}\n`;
    context.data.forEach((flight, index) => {
      contextText += `${index + 1}. ${flight.flightNumber} (${
        flight.airline
      })\n`;
      contextText += `   ${flight.departure} → ${flight.arrival}\n`;
      contextText += `   Giờ: ${flight.departureTime} - ${flight.arrivalTime}\n`;
      contextText += `   Giá: ${flight.price}\n`;
      contextText += `   Ghế trống: ${flight.seats}\n`;
      contextText += `   Trạng thái: ${flight.status}\n\n`;
    });
  } else if (context.type === "airports") {
    contextText = `${context.message}\n`;
    context.data.forEach((airport) => {
      contextText += `- ${airport.name} (${airport.code}) - ${airport.city}\n`;
    });
  } else {
    contextText = context.message;
  }

  return `Bạn là trợ lý AI của AirSky, thân thiện, hữu ích. Trả lời bằng tiếng Việt tự nhiên.
THÔNG TIN: ${contextText}
CÂU HỎI: ${message}
HƯỚNG DẪN:
- Bắt đầu thân thiện: "Chào bạn!"
- Dùng dữ liệu thực tế từ context, tránh bịa đặt.
- Nếu có flights, liệt kê rõ ràng với mã, hãng, thời gian, giá (VND), ghế.
- Nếu không có, gợi ý kiểm tra tên thành phố/sân bay hoặc ngày khác.
- Hỏi thêm: "Bạn cần giúp gì nữa không?"
- Giữ ngắn gọn, trò chuyện như bạn bè.`;
}

module.exports = {
  extractEntitiesFromMessage,
  extractCities,
  buildSmartContext,
  buildPrompt,
  extractDate,
};
