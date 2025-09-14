// utils/config.js
module.exports = {
  // Date patterns cho extractDate
  DATE_PATTERNS: [
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
  ],

  // Stop words cho extractCities
  STOP_WORDS: [
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
  ],

  // Fuzzy search options
  FUSE_OPTIONS: {
    keys: ["city_name", "airport_name", "airport_code"],
    threshold: 0.4,
    includeScore: true,
  },

  // Tỉnh không có sân bay
  NO_AIRPORT_CITIES: ["bình thuận", "bạc liêu"],
  NO_AIRPORT_SUGGESTIONS: {
    "bình thuận": "Thử sân bay Liên Khương (Đà Lạt) hoặc Cam Ranh (Nha Trang).",
    "bạc liêu": "Thử sân bay Cần Thơ hoặc Rạch Giá.",
  },

  // Prompt templates
  EXTRACT_ENTITIES_PROMPT: `
    Trích xuất thông tin từ tin nhắn sau bằng tiếng Việt:
    - Departure city/airport (thành phố/sân bay đi)
    - Arrival city/airport (thành phố/sân bay đến)
    - Date (ngày bay, format YYYY-MM-DD, bao gồm cả năm nếu có trong tin nhắn)

    Tin nhắn: "{message}"

    HƯỚNG DẪN CHI TIẾT:
    - TÌM THÀNH PHỐ/SÂN BAY: Tìm từ khóa như "từ", "đi", "đến", "sân bay", tên thành phố Việt Nam
    - VÍ DỤ: "từ Hà Nội đi Đà Nẵng" → departure: "Hà Nội", arrival: "Đà Nẵng"
    - VÍ DỠ: "SGN đến HAN" → departure: "SGN", arrival: "HAN"
    - VÍ DỤ: "từ sân bay cam ranh" → departure: "Cam Ranh"
    - VÍ DỠ: "đến sân bay quốc tế nội bài" → arrival: "Hà Nội"
    - VÍ DỤ: "chuyến bay ngày 1/6" → date: "2025-06-01"
    - VÍ DỤ: "tôi muốn bay từ ninh thuận" → departure: "Ninh Thuận"
    - Nếu không có thông tin, trả về null

    Trả lời CHỈ JSON, không có text khác: { "departure": "string|null", "arrival": "string|null", "date": "YYYY-MM-DD|null" }
  `,
};
