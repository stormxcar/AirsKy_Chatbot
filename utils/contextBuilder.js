const queries = require("./queries");
const { extractDate } = require("./entityExtractor");

// Hàm xây dựng context tối ưu
async function buildSmartContext(userId, message, dbPool, entities) {
  console.log("🔍 Building context for:", message);
  console.log("🔍 Entities:", entities);

  const departureCity = entities.departure || null;
  const arrivalCity = entities.arrival || null;
  const date = entities.date || extractDate(message);

  // Nếu không có thông tin tìm kiếm, trả về text response
  if (!departureCity && !arrivalCity && !date) {
    return {
      type: "text",
      message:
        "Để tìm chuyến bay, bạn hãy cho tôi biết điểm đi và điểm đến nhé!",
      data: [],
    };
  }

  try {
    // Sử dụng queries.searchFlightsChatbot có sẵn thay vì build lại
    const queryParams = [
      // Departure search parameters
      departureCity || null,
      departureCity ? `%${departureCity}%` : null, // city_name LIKE
      departureCity ? `%${departureCity}%` : null, // airport_name LIKE
      departureCity || null, // airport_code =

      // Arrival search parameters
      arrivalCity || null,
      arrivalCity ? `%${arrivalCity}%` : null, // city_name LIKE
      arrivalCity ? `%${arrivalCity}%` : null, // airport_name LIKE
      arrivalCity || null, // airport_code =

      // Date parameters
      date || null, // date check
      date || null, // date value for DATE()
    ];

    console.log(
      "📝 Using searchFlightsChatbot query with params:",
      queryParams
    );

    const [rows] = await dbPool.query(
      queries.searchFlightsChatbot,
      queryParams
    );
    console.log("✈️ Found flights:", rows.length);

    if (rows.length === 0) {
      return {
        type: "flights",
        message: `Không tìm thấy chuyến bay từ ${
          departureCity || "điểm đi"
        } đến ${arrivalCity || "điểm đến"}${
          date ? ` vào ngày ${date}` : ""
        }. Vui lòng thử ngày khác hoặc liên hệ hotline.`,
        data: [],
      };
    }

    // Format flight data with markdown
    const flights = rows.map((flight, index) => ({
      flightId: flight.flight_id || "N/A",
      flightNumber: flight.flight_number || "N/A",
      airline: flight.airline_name || "N/A",
      tripType: flight.trip_type || "One-way",
      departureAirport: flight.departure_airport_name || "N/A",
      departureCode: flight.departure_airport_code || "N/A",
      arrivalAirport: flight.arrival_airport_name || "N/A",
      arrivalCode: flight.arrival_airport_code || "N/A",
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
      price: flight.base_price
        ? `${flight.base_price.toLocaleString("vi-VN")} ₫`
        : "N/A",
    }));

    // Create detailed markdown message
    let markdownMessage = `## ✈️ Kết quả tìm kiếm chuyến bay\n\n`;
    markdownMessage += `**Tuyến bay:** ${departureCity || "N/A"} → ${
      arrivalCity || "N/A"
    }\n`;
    markdownMessage += `**Số chuyến bay tìm thấy:** ${flights.length}\n\n`;

    if (flights.length > 0) {
      markdownMessage += `### 📋 Danh sách chuyến bay:\n\n`;

      flights.forEach((flight, index) => {
        markdownMessage += `**${index + 1}. ${flight.flightNumber}** - ${
          flight.airline
        }\n`;
        markdownMessage += `- **Từ:** ${flight.departure} (${flight.departureAirport} - ${flight.departureCode})\n`;
        markdownMessage += `- **Đến:** ${flight.arrival} (${flight.arrivalAirport} - ${flight.arrivalCode})\n`;
        markdownMessage += `- **Giờ khởi hành:** ${flight.departureTime}\n`;
        markdownMessage += `- **Giờ đến:** ${flight.arrivalTime}\n`;
        markdownMessage += `- **Giá vé:** ${flight.price}\n`;
        markdownMessage += `- **Ghế trống:** ${flight.seats}\n\n`;
      });

      markdownMessage += `### 💡 Lưu ý:\n`;
      markdownMessage += `- Giá vé có thể thay đổi tùy thời điểm đặt\n`;
      markdownMessage += `- Vui lòng kiểm tra lại trước khi đặt vé\n`;
      markdownMessage += `- Liên hệ hotline để được tư vấn thêm\n`;
    }

    return {
      type: "flights",
      message: markdownMessage,
      data: flights,
    };
  } catch (error) {
    console.error("❌ Database error:", error);
    return {
      type: "text",
      message: "Xin lỗi, có lỗi khi tìm kiếm chuyến bay. Vui lòng thử lại sau.",
      data: [],
    };
  }
}

module.exports = { buildSmartContext };
