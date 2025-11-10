const Fuse = require("fuse.js");
const { callAPI } = require("./api");
const { getLangChainSQLManager } = require("./langchainSQL");
const { airportCache } = require("./cache");

// Hard-coded configurations
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
  { pattern: /hôm\s*nay/i, type: "today" },
  { pattern: /ngày\s*mai/i, type: "tomorrow" },
  { pattern: /ngày\s*mốt/i, type: "day_after" },
  { pattern: /cuối\s*tuần/i, type: "weekend" },
  { pattern: /tuần\s*sau/i, type: "next_week" },
  { pattern: /(thứ\s*(hai|2)\s*tuần\s*sau)/i, type: "next_monday" },
  { pattern: /(thứ\s*(ba|3)\s*tuần\s*sau)/i, type: "next_tuesday" },
  { pattern: /(thứ\s*(tư|4)\s*tuần\s*sau)/i, type: "next_wednesday" },
  { pattern: /(thứ\s*(năm|5)\s*tuần\s*sau)/i, type: "next_thursday" },
  { pattern: /(thứ\s*(sáu|6)\s*tuần\s*sau)/i, type: "next_friday" },
  { pattern: /(thứ\s*(bảy|7)\s*tuần\s*sau)/i, type: "next_saturday" },
  { pattern: /(chủ\s*nhật\s*tuần\s*sau)/i, type: "next_sunday" },
  { pattern: /(hai|2)\s*tuần\s*sau/i, type: "two_weeks_later" },
  { pattern: /(ba|3)\s*tuần\s*sau/i, type: "three_weeks_later" },
  { pattern: /tháng\s*sau/i, type: "next_month" },
];

const EXTRACT_ENTITIES_PROMPT = `
  Trích xuất thông tin từ tin nhắn sau bằng tiếng Việt:
  - Departure city/airport (thành phố/sân bay đi)
  - Arrival city/airport (thành phố/sân bay đến)
  - Date (ngày bay đi, format YYYY-MM-DD, bao gồm cả năm nếu có trong tin nhắn)
  - Return date (ngày bay về cho vé khứ hồi, format YYYY-MM-DD, null nếu không có)
  - Trip type (loại chuyến bay: "ONE_WAY" cho một chiều, "ROUND_TRIP" cho khứ hồi, "MULTI_CITY" cho đa thành phố)
  - Stops (điểm dừng trung gian, array of cities/airports, null nếu không có)

  QUAN TRỌNG VỀ NGÀY THÁNG:
  - NGÀY HIỆN TẠI LÀ: ${
    new Date().toISOString().split("T")[0]
  } (${new Date().toLocaleDateString("vi-VN")})
  - LUÔN SỬ DỤNG NĂM HIỆN TẠI HOẶC TƯƠNG LAI CHO CÁC NGÀY TƯƠNG LAI
  - Nếu user nói "tháng 10" và tháng hiện tại < 10 → sử dụng năm hiện tại
  - Nếu user nói "tháng 10" và tháng hiện tại >= 10 → sử dụng năm sau
  - Nếu user nói "tháng 1" hoặc "tháng 2" và tháng hiện tại >= 10 → sử dụng năm sau

  Tin nhắn: "{message}"

  HƯỚNG DẪN CHI TIẾT:
  - TÌM THÀNH PHỐ/SÂN BAY: Tìm từ khóa như "từ", "đi", "đến", tên thành phố Việt Nam
  - TÌM ĐIỂM DỪNG: Tìm từ khóa như "có điểm dừng", "dừng ở", "qua", "trung chuyển", "stop", "layover"
  - VÍ DỤ: "từ Hà Nội đi Đà Nẵng" → departure: "Hà Nội", arrival: "Đà Nẵng", trip_type: "ONE_WAY", stops: null
  - VÍ DỤ: "SGN đến HAN" → departure: "SGN", arrival: "HAN", trip_type: "ONE_WAY", stops: null
  - VÍ DỤ: "khứ hồi từ Sài Gòn ra Hà Nội" → trip_type: "ROUND_TRIP", stops: null
  - VÍ DỤ: "đi về từ Đà Nẵng ngày 1/6 về 5/6" → date: "2025-06-01", return_date: "2025-06-05", trip_type: "ROUND_TRIP", stops: null (năm hiện tại sẽ được sử dụng nếu không chỉ định)
    - VÍ DỤ: "khứ hồi từ Sài Gòn ra Hà Nội vào ngày 29 tháng 9 và ngày về là ngày 3 tháng 10" → date: "2025-09-29", return_date: "2025-10-03", trip_type: "ROUND_TRIP", stops: null
  - VÍ DỤ: "đi về từ Đà Nẵng ngày 1/6 về 5/6" → date: "2025-06-01", return_date: "2025-06-05", trip_type: "ROUND_TRIP", stops: null
  - VÍ DỤ: "chuyến bay khứ hồi ngày 15/10 về 20/10" → date: "2025-10-15", return_date: "2025-10-20", trip_type: "ROUND_TRIP", stops: null
  - VÍ DỤ DỄ HIỂU RETURN DATE: "ngày về là ngày 3 tháng 10" = return_date: "2025-10-03"
  - VÍ DỤ DỄ HIỂU RETURN DATE: "về ngày 5/6" = return_date: "2025-06-05"
  - VÍ DỤ DỄ HIỂU RETURN DATE: "quay lại 10/7" = return_date: "2025-07-10"
  - VÍ DỠ: "đi về 15/8" = return_date: "2025-08-15"
  - VÍ DỤ: "chuyến bay ngày 1/6" → date: "2025-06-01", trip_type: "ONE_WAY", stops: null (sử dụng năm hiện tại nếu không chỉ định)
  - VÍ DỤ: "từ Hà Nội đến Đà Nẵng có điểm dừng ở Phú Yên" → departure: "Hà Nội", arrival: "Đà Nẵng", stops: ["Phú Yên"], trip_type: "MULTI_CITY"
  - VÍ DỤ: "Hanoi to Tokyo via Seoul" → departure: "Hanoi", arrival: "Tokyo", stops: ["Seoul"], trip_type: "MULTI_CITY"
  - VÍ DỤ: "chuyến bay qua Dubai" → stops: ["Dubai"], trip_type: "MULTI_CITY"
  - VÍ DỠ: "chuyến bay hôm nay" → date: null, trip_type: "ONE_WAY", stops: null (để hệ thống tự động sử dụng ngày hiện tại ${
    new Date().toISOString().split("T")[0]
  })
  - VÍ DỠ: "chuyến bay cuối tuần" → date: null (để hệ thống tự động tính)
  - VÍ DỠ: "thứ hai tuần sau" → date: null (để hệ thống tự động tính, sẽ là ${
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  })
  - VÍ DỠ: "ba tuần sau" → date: null (để hệ thống tự động tính)
  - QUAN TRỌNG: Với "hôm nay" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "ngày mai" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "cuối tuần" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ hai tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ ba tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ tư tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ năm tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ sáu tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ bảy tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "chủ nhật tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "hai tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "ba tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: KHÔNG sử dụng ngày tháng năm cũ như 2024-10-04 , 2023-05-15, luôn để date = null cho từ khóa đặc biệt
  - QUAN TRỌNG: KHÔNG TỰ Ý TÍNH TOÁN NGÀY THÁNG, luôn để hệ thống xử lý
  - QUAN TRỌNG: Luôn sử dụng năm hiện tại 2025 nếu user không chỉ định năm trong date. Ví dụ: "ngày 1/6" → sử dụng năm hiện tại 2025
  - TỪ KHÓA KHỨ HỒI: "khứ hồi", "đi về", "round trip", "return", "về lại", "quay lại"
  - TỪ KHÓA ĐA THÀNH PHỐ: "đa thành phố", "multi-city", "connecting", "có điểm dừng", "dừng ở", "qua", "trung chuyển"
  - Nếu có từ khóa đa thành phố hoặc điểm dừng → trip_type: "MULTI_CITY"
  - Nếu có từ khóa khứ hồi → trip_type: "ROUND_TRIP"
  - Nếu không có từ khóa đặc biệt → trip_type: "ONE_WAY"
  - Nếu không có thông tin, trả về null
  - VÍ DỤ: "đi về từ Đà Nẵng ngày 1/6 về 5/6" → date: "2025-06-01", return_date: "2025-06-05", trip_type: "ROUND_TRIP", stops: null
  - VÍ DỤ: "chuyến bay khứ hồi ngày 15/10 về 20/10" → date: "2025-10-15", return_date: "2025-10-20", trip_type: "ROUND_TRIP", stops: null
  - VÍ DỤ DỄ HIỂU RETURN DATE: "ngày về là ngày 3 tháng 10" = return_date: "2025-10-03"
  - VÍ DỤ DỄ HIỂU RETURN DATE: "về ngày 5/6" = return_date: "2025-06-05"
  - VÍ DỤ DỄ HIỂU RETURN DATE: "quay lại 10/7" = return_date: "2025-07-10"
  - VÍ DỤ DỄ HIỂU RETURN DATE: "đi về 15/8" = return_date: "2025-08-15"
  - VÍ DỤ: "chuyến bay ngày 1/6" → date: "2025-06-01", trip_type: "ONE_WAY", stops: null (sử dụng năm hiện tại nếu không chỉ định)
  - VÍ DỤ: "từ Hà Nội đến Đà Nẵng có điểm dừng ở Phú Yên" → departure: "Hà Nội", arrival: "Đà Nẵng", stops: ["Phú Yên"], trip_type: "MULTI_CITY"
  - VÍ DỤ: "Hanoi to Tokyo via Seoul" → departure: "Hanoi", arrival: "Tokyo", stops: ["Seoul"], trip_type: "MULTI_CITY"
  - VÍ DỤ: "chuyến bay qua Dubai" → stops: ["Dubai"], trip_type: "MULTI_CITY"
  - VÍ DỤ: "chuyến bay hôm nay" → date: null, trip_type: "ONE_WAY", stops: null (để hệ thống tự động sử dụng ngày hiện tại ${
    new Date().toISOString().split("T")[0]
  })
  - VÍ DỠ: "chuyến bay cuối tuần" → date: null (để hệ thống tự động tính)
  - VÍ DỠ: "thứ hai tuần sau" → date: null (để hệ thống tự động tính, sẽ là ${
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  })
  - VÍ DỠ: "ba tuần sau" → date: null (để hệ thống tự động tính)
  - QUAN TRỌNG: Với "hôm nay" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "ngày mai" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "cuối tuần" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ hai tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ ba tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ tư tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ năm tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ sáu tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "thứ bảy tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "chủ nhật tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "hai tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: Với "ba tuần sau" luôn để date = null, KHÔNG trả về date cụ thể
  - QUAN TRỌNG: KHÔNG sử dụng ngày tháng năm cũ như 2024-10-04 , 2023-05-15, luôn để date = null cho từ khóa đặc biệt
  - QUAN TRỌNG: KHÔNG TỰ Ý TÍNH TOÁN NGÀY THÁNG, luôn để hệ thống xử lý
  - QUAN TRỌNG: Luôn sử dụng năm hiện tại 2025 nếu user không chỉ định năm trong date. Ví dụ: "ngày 1/6" → sử dụng năm hiện tại 2025
  - TÌM SỐ HÀNH KHÁCH: Tìm số trước "người", "hành khách", "khách"
  - Nếu có từ khóa đa thành phố hoặc điểm dừng → trip_type: "MULTI_CITY"
  - Nếu có từ khóa khứ hồi → trip_type: "ROUND_TRIP"
  - Nếu không có từ khóa đặc biệt → trip_type: "ONE_WAY"
  - Nếu không có thông tin, trả về null

  Trả lời CHỈ JSON, không có text khác: { "departure": "string|null", "arrival": "string|null", "date": "YYYY-MM-DD|null", "return_date": "YYYY-MM-DD|null", "passengers": number, "trip_type": "ONE_WAY|ROUND_TRIP|MULTI_CITY", "stops": "array|null" }
`;

// Hàm kiểm tra ngày hợp lệ
const isValidDate = (year, month, day) => {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

// Hàm kiểm tra ngày có trong quá khứ hay không
const isDateInPast = (dateStr, today) => {
  const date = new Date(dateStr);
  return date < today.setHours(0, 0, 0, 0);
};

// Hàm định dạng ngày thành YYYY-MM-DD
const formatDate = (year, month, day) => {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
};

// Hàm trích xuất ngày từ tin nhắn
function extractDateFromMessage(message) {
  const lowerMessage = message.toLowerCase();
  const today = new Date(); // Sử dụng ngày hiện tại thực tế
  const currentYear = today.getFullYear();

  // Xử lý "hôm nay" và "ngày mai" theo hướng dẫn: trả về null để hệ thống tự xử lý
  if (lowerMessage.includes("hôm nay")) {
    console.log("📅 Detected 'hôm nay', returning null for system to handle");
    return null;
  }
  if (lowerMessage.includes("ngày mai")) {
    console.log("📅 Detected 'ngày mai', returning null for system to handle");
    return null;
  }
  if (lowerMessage.includes("ngày mốt")) {
    const dayAfter = new Date(today);
    dayAfter.setDate(today.getDate() + 2);
    console.log(
      "📅 Detected 'ngày mốt', returning:",
      dayAfter.toISOString().split("T")[0]
    );
    return dayAfter.toISOString().split("T")[0];
  }
  if (lowerMessage.includes("cuối tuần")) {
    const daysUntilSaturday = (6 - today.getDay()) % 7;
    const saturday = new Date(today);
    saturday.setDate(
      today.getDate() + (daysUntilSaturday === 0 ? 7 : daysUntilSaturday)
    );
    console.log(
      "📅 Detected 'cuối tuần', returning:",
      saturday.toISOString().split("T")[0]
    );
    return saturday.toISOString().split("T")[0];
  }
  if (lowerMessage.includes("hai tuần sau")) {
    const twoWeeksLater = new Date(today);
    twoWeeksLater.setDate(today.getDate() + 14);
    console.log(
      "📅 Detected 'hai tuần sau', returning:",
      twoWeeksLater.toISOString().split("T")[0]
    );
    return twoWeeksLater.toISOString().split("T")[0];
  }
  if (lowerMessage.includes("ba tuần sau")) {
    const threeWeeksLater = new Date(today);
    threeWeeksLater.setDate(today.getDate() + 21);
    console.log(
      "📅 Detected 'ba tuần sau', returning:",
      threeWeeksLater.toISOString().split("T")[0]
    );
    return threeWeeksLater.toISOString().split("T")[0];
  }
  if (lowerMessage.includes("tháng sau")) {
    const nextMonth = new Date(today);
    nextMonth.setMonth(today.getMonth() + 1);
    console.log(
      "📅 Detected 'tháng sau', returning:",
      nextMonth.toISOString().split("T")[0]
    );
    return nextMonth.toISOString().split("T")[0];
  }

  // Xử lý các ngày cụ thể trong tuần sau
  const dayOfWeekMap = {
    next_monday: {
      keyword: ["thứ hai tuần sau", "thứ 2 tuần sau"],
      targetDay: 1,
    },
    next_tuesday: {
      keyword: ["thứ ba tuần sau", "thứ 3 tuần sau"],
      targetDay: 2,
    },
    next_wednesday: {
      keyword: ["thứ tư tuần sau", "thứ 4 tuần sau"],
      targetDay: 3,
    },
    next_thursday: {
      keyword: ["thứ năm tuần sau", "thứ 5 tuần sau"],
      targetDay: 4,
    },
    next_friday: {
      keyword: ["thứ sáu tuần sau", "thứ 6 tuần sau"],
      targetDay: 5,
    },
    next_saturday: {
      keyword: ["thứ bảy tuần sau", "thứ 7 tuần sau"],
      targetDay: 6,
    },
    next_sunday: { keyword: ["chủ nhật tuần sau"], targetDay: 0 },
  };

  for (const [type, { keyword, targetDay }] of Object.entries(dayOfWeekMap)) {
    if (keyword.some((k) => lowerMessage.includes(k))) {
      const currentDay = today.getDay();
      let daysUntil = (targetDay - currentDay + 7) % 7;
      if (daysUntil === 0) daysUntil = 7; // If it's the same day, go to next week

      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntil);
      console.log(
        `📅 Detected '${keyword[0]}', targetDay: ${targetDay}, currentDay: ${currentDay}, daysUntil: ${daysUntil}, returning:`,
        targetDate.toISOString().split("T")[0]
      );
      return targetDate.toISOString().split("T")[0];
    }
  }

  // Xử lý "tuần sau" (phải kiểm tra sau các ngày cụ thể)
  if (lowerMessage.includes("tuần sau")) {
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    console.log(
      "📅 Detected 'tuần sau', returning:",
      nextWeek.toISOString().split("T")[0]
    );
    return nextWeek.toISOString().split("T")[0];
  }

  // Xử lý định dạng ngày cụ thể
  for (const { pattern, type } of DATE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      let year, month, day;
      switch (type) {
        case "full":
        case "text_full":
          year = parseInt(match[3], 10);
          month = parseInt(match[2], 10);
          day = parseInt(match[1], 10);
          break;
        case "short":
        case "text_short":
          year = currentYear;
          month = parseInt(match[2], 10);
          day = parseInt(match[1], 10);
          break;
        default:
          continue;
      }

      // Kiểm tra ngày hợp lệ
      if (!isValidDate(year, month, day)) {
        console.warn(`📅 Invalid date: ${day}/${month}/${year}`);
        return null;
      }

      const dateStr = formatDate(year, month, day);
      // Kiểm tra ngày trong quá khứ
      if (isDateInPast(dateStr, today)) {
        console.warn(`📅 Date ${dateStr} is in the past, returning null`);
        return null; // Hoặc sử dụng year + 1 nếu muốn: formatDate(year + 1, month, day)
      }

      console.log(`📅 Extracted date: ${dateStr}`);
      return dateStr;
    }
  }

  console.log("📅 No date extracted, returning null");
  return null;
}

// Hàm trích xuất entities (fallback cải tiến)
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

  // Trích xuất departure và arrival với nhiều patterns hơn
  const departurePatterns = [
    /từ\s+(.+?)\s+(?:đến|đi|vào|sang|qua|ra)/i,
    /từ\s+(.+?)\s+(?:ngày|tháng|hôm|có)/i,
    /đi\s+từ\s+(.+?)\s+(?:đến|vào)/i,
    /chuyến\s+bay\s+từ\s+(.+?)\s+(?:đến|vào|đi)/i,
  ];

  for (const pattern of departurePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      entities.departure = match[1].trim();
      console.log(`📍 Extracted departure: ${entities.departure}`);

      // Tìm arrival sau departure
      const afterDeparture = message.substring(
        message.indexOf(match[1]) + match[1].length
      );
      const arrivalPatterns = [
        /(?:đến|vào|đi|sang|qua|ra)\s+(.+?)(?:\s+(?:ngày|tháng|hôm|có|không|$))/i,
        /\s+(.+?)(?:\s+(?:ngày|tháng|hôm|có|không|$))/i,
      ];

      for (const arrPattern of arrivalPatterns) {
        const arrMatch = afterDeparture.match(arrPattern);
        if (
          arrMatch &&
          arrMatch[1] &&
          arrMatch[1].trim() !== entities.departure
        ) {
          entities.arrival = arrMatch[1].trim();
          console.log(`📍 Extracted arrival: ${entities.arrival}`);
          break;
        }
      }
      break;
    }
  }

  // Fallback: tìm "từ" và "đến/vào" cơ bản
  if (!entities.departure || !entities.arrival) {
    const tuIndex = lowerMessage.indexOf("từ");
    if (tuIndex !== -1) {
      const afterTu = message.substring(tuIndex + 3).trim();
      const keywordPattern = /(đến|đi|sang|qua|ra|vào|có)/i;
      const keywordMatch = afterTu.match(keywordPattern);

      if (keywordMatch) {
        const keywordIndex = keywordMatch.index;
        if (!entities.departure) {
          entities.departure = afterTu.substring(0, keywordIndex).trim();
        }

        const afterKeyword = afterTu
          .substring(keywordIndex + keywordMatch[0].length)
          .trim();
        const nextKeywordMatch = afterKeyword.match(
          /(ngày|tháng|năm|hôm|trong|không|có\s+(điểm\s+dừng|chuyến\s+bay))/i
        );
        if (!entities.arrival) {
          entities.arrival = nextKeywordMatch
            ? afterKeyword.substring(0, nextKeywordMatch.index).trim()
            : afterKeyword.split(/\s+/).slice(0, 3).join(" ");
        }

        console.log(
          `📍 Fallback extracted route: ${entities.departure} → ${entities.arrival}`
        );
      }
    }
  }

  // Trích xuất return_date cho vé khứ hồi
  const returnDatePatterns = [
    /(?:ngày\s+về\s+là\s+ngày\s+|về\s+ngày\s+|quay\s+lại\s+ngày\s+|đi\s+về\s+)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i,
    /(?:ngày\s+về\s+là\s+|về\s+|quay\s+lại\s+|đi\s+về\s+)(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{4}))?/i,
    /(?:ngày\s+về\s+là\s+ngày\s+)(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{4}))?/i,
    /(\d{1,2})\/(\d{1,2})\s+về\s+(\d{1,2})\/(\d{1,2})/i,
    /(?:và\s+ngày\s+về\s+là\s+ngày\s+|và\s+về\s+ngày\s+)(\d{1,2})\s*tháng\s*(\d{1,2})/i,
    /(?:ngày\s+về\s+là\s+)(\d{1,2})\s*tháng\s*(\d{1,2})/i,
    /(?:về\s+ngày\s+)(\d{1,2})\/(\d{1,2})/i,
    /(?:quay\s+lại\s+)(\d{1,2})\/(\d{1,2})/i,
    /(?:đi\s+về\s+)(\d{1,2})\/(\d{1,2})/i,
  ];

  for (const pattern of returnDatePatterns) {
    const match = message.match(pattern);
    if (match) {
      let year, month, day;

      if (pattern.source.includes("tháng")) {
        // Pattern: "ngày 3 tháng 10" hoặc "3 tháng 10"
        if (match[4]) {
          // Có năm: match[2]=day, match[3]=month, match[4]=year
          year = parseInt(match[4], 10);
          month = parseInt(match[3], 10);
          day = parseInt(match[2], 10);
        } else {
          // Không có năm: match[1]=day, match[2]=month
          year = new Date().getFullYear();
          month = parseInt(match[2], 10);
          day = parseInt(match[1], 10);
        }
      } else if (pattern.source.includes("về")) {
        // Pattern: "1/6 về 5/6"
        if (match.length >= 5) {
          // Return date is match[3] and match[4]
          year = new Date().getFullYear();
          month = parseInt(match[4], 10);
          day = parseInt(match[3], 10);
        } else {
          // Single date pattern
          year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
          month = parseInt(match[2], 10);
          day = parseInt(match[1], 10);
        }
      } else {
        // Default pattern
        year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
        month = parseInt(match[2], 10);
        day = parseInt(match[1], 10);
      }

      if (isValidDate(year, month, day)) {
        const returnDateStr = formatDate(year, month, day);
        if (!isDateInPast(returnDateStr, new Date())) {
          entities.return_date = returnDateStr;
          console.log(`📅 Extracted return_date: ${entities.return_date}`);
        } else {
          console.warn(
            `📅 Return date ${returnDateStr} is in the past, ignoring`
          );
        }
      }
      break;
    }
  }

  // Xử lý multi-city
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
  if (multiCityKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    entities.trip_type = "MULTI_CITY";
    console.log("🎯 Detected multi-city trip type");

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
        entities.stops = [
          stopMatch[1].trim().split(/\s+/).slice(0, 3).join(" "),
        ];
        console.log(`🛑 Extracted stop: ${entities.stops[0]}`);
        break;
      }
    }
  }

  // Xử lý khứ hồi - nhưng luôn đặt là ONE_WAY cho chatbot
  const roundTripKeywords = [
    "khứ hồi",
    "đi về",
    "round trip",
    "return",
    "về lại",
    "quay lại",
  ];
  if (roundTripKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    entities.trip_type = "ONE_WAY"; // Luôn là ONE_WAY cho chatbot
    console.log(
      "🔄 Detected round-trip request but forced to ONE_WAY for chatbot"
    );
  }

  // Xử lý một chiều (explicit one-way)
  const oneWayKeywords = [
    "một chiều",
    "one way",
    "chiều đi",
    "chỉ đi",
    "không về",
  ];
  if (oneWayKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    entities.trip_type = "ONE_WAY";
    console.log("➡️ Detected one-way trip type");
  }

  console.log("✅ Simple extraction result:", entities);
  return entities;
}

// Hàm chính trích xuất entities
async function extractEntitiesFromMessage(message) {
  console.log("🔍 Original message:", message);

  const extractPrompt = EXTRACT_ENTITIES_PROMPT.replace("{message}", message);

  try {
    const response = await callAPI(extractPrompt);
    console.log("🤖 Mistral raw response:", response);
    const jsonMatch = response.match(/\{.*\}/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("🤖 Parsed entities:", parsed);
      // Đảm bảo date = null cho "hôm nay" và "ngày mai"
      if (
        message.toLowerCase().includes("hôm nay") ||
        message.toLowerCase().includes("ngày mai")
      ) {
        parsed.date = null;
      }
      // Kiểm tra ngày trong quá khứ
      if (parsed.date && isDateInPast(parsed.date, new Date())) {
        console.warn(`📅 Date ${parsed.date} is in the past, setting to null`);
        parsed.date = null;
      }
      if (parsed.return_date && isDateInPast(parsed.return_date, new Date())) {
        console.warn(
          `📅 Return date ${parsed.return_date} is in the past, setting to null`
        );
        parsed.return_date = null;
      }
      // Luôn đặt trip_type là ONE_WAY bất kể user yêu cầu gì
      parsed.trip_type = "ONE_WAY";
      console.log("🔄 Forced trip_type to ONE_WAY for chatbot");
      return parsed;
    } else {
      console.warn(
        "⚠️ No JSON found in Mistral response, using simple fallback"
      );
      return simpleExtractEntities(message);
    }
  } catch (error) {
    console.error("❌ Error extracting entities:", error);
    return simpleExtractEntities(message);
  }
}

// Hàm tìm kiếm sân bay
async function searchAirports(query) {
  try {
    const airports = await airportCache.getAirports();
    const fuse = new Fuse(airports, FUSE_OPTIONS);
    return fuse
      .search(query)
      .filter((result) => result.score < 0.6)
      .slice(0, 5)
      .map((result) => result.item);
  } catch (error) {
    console.error("❌ Error searching airports:", error);
    return [];
  }
}

// Hàm xử lý entities
async function processEntities(entities, originalMessage) {
  const processed = { ...entities };

  if (processed.departure) {
    const departureAirports = await searchAirports(processed.departure);
    if (departureAirports.length > 0) {
      processed.departureAirport = departureAirports[0];
    }
  }

  if (processed.arrival) {
    const arrivalAirports = await searchAirports(processed.arrival);
    if (arrivalAirports.length > 0) {
      processed.arrivalAirport = arrivalAirports[0];
    }
  }

  if (processed.stops && Array.isArray(processed.stops)) {
    processed.processedStops = [];
    for (const stop of processed.stops) {
      const stopAirports = await searchAirports(stop);
      if (stopAirports.length > 0) {
        processed.processedStops.push({ city: stop, airport: stopAirports[0] });
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
  extractDate: extractDateFromMessage, // Alias for backward compatibility
  simpleExtractEntities,
};
