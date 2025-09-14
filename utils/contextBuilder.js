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
    // Build query dynamically based on available parameters
    let query = `
      SELECT
        f.flight_id,
        f.flight_number,
        f.departure_time,
        f.arrival_time,
        f.base_price,
        f.available_seats,
        f.trip_type,
        da.airport_name as departure_airport_name,
        da.airport_code as departure_airport_code,
        da.city_name as departure_city_name,
        aa.airport_name as arrival_airport_name,
        aa.airport_code as arrival_airport_code,
        aa.city_name as arrival_city_name,
        al.airline_name
      FROM flights f
      LEFT JOIN airports da ON f.departure_airport_id = da.airport_id
      LEFT JOIN airports aa ON f.arrival_airport_id = aa.airport_id
      LEFT JOIN airlines al ON f.airline_id = al.airline_id
      WHERE f.status IN ('ON_TIME', 'DELAYED', 'SCHEDULED')
    `;

    const queryParams = [];

    // Add departure conditions
    if (departureCity) {
      query += ` AND (? IS NULL OR LOWER(da.city_name) LIKE LOWER(?) OR LOWER(da.airport_name) LIKE LOWER(?) OR LOWER(da.airport_code) = LOWER(?))`;
      queryParams.push(
        departureCity,
        `%${departureCity}%`,
        `%${departureCity}%`,
        departureCity
      );
    }

    // Add arrival conditions
    if (arrivalCity) {
      query += ` AND (? IS NULL OR LOWER(aa.city_name) LIKE LOWER(?) OR LOWER(aa.airport_name) LIKE LOWER(?) OR LOWER(aa.airport_code) = LOWER(?))`;
      queryParams.push(
        arrivalCity,
        `%${arrivalCity}%`,
        `%${arrivalCity}%`,
        arrivalCity
      );
    }

    // Add date condition
    if (date) {
      query += ` AND DATE(f.departure_time) = ?`;
      queryParams.push(date);
    }

    query += ` ORDER BY f.departure_time ASC LIMIT 50`;

    console.log("📝 Final query:", query);
    console.log("📝 Query params:", queryParams);

    const [rows] = await dbPool.query(query, queryParams);
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
      airline: flight.airline_name || "Unknown Airline",
      tripType: flight.trip_type || "One-way",
      departure: flight.departure_city_name || "N/A",
      departureAirport: flight.departure_airport_name || "N/A",
      departureCode: flight.departure_airport_code || "N/A",
      arrival: flight.arrival_city_name || "N/A",
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
      seats: flight.available_seats != null
        ? flight.available_seats.toString()
        : "N/A",
    }));

    // Create detailed markdown message
    let markdownMessage = `## ✈️ Kết quả tìm kiếm chuyến bay\n\n`;
    markdownMessage += `**Tuyến bay:** ${departureCity || "N/A"} → ${arrivalCity || "N/A"}\n`;
    markdownMessage += `**Số chuyến bay tìm thấy:** ${flights.length}\n\n`;

    if (flights.length > 0) {
      markdownMessage += `### 📋 Danh sách chuyến bay:\n\n`;

      flights.forEach((flight, index) => {
        markdownMessage += `**${index + 1}. ${flight.flightNumber}** - ${flight.airline}\n`;
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
