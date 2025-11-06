const queries = require("./queries");
const { extractDate } = require("./entityExtractor");

// Hàm xây dựng context tối ưu
async function buildSmartContext(userId, message, dbPool, entities) {
  console.log("🔍 Building context for:", message);
  console.log("🔍 Entities:", entities);

  const departureCity = entities.departure || null;
  const arrivalCity = entities.arrival || null;
  const date = entities.date || extractDate(message);
  const tripType = entities.trip_type || "ONE_WAY"; // Default to ONE_WAY if not specified

  let groupedFlights = null; // Store grouped flights for round-trip display

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
    let queryToUse, queryParams;

    if (tripType === "MULTI_CITY") {
      // Use multi-city query with stops
      queryToUse = queries.searchMultiCityFlights;
      queryParams = [
        // Departure search parameters
        departureCity ? `%${departureCity}%` : null, // da.city_name LIKE ?
        departureCity ? `%${departureCity}%` : null, // da.airport_name LIKE ?
        departureCity || null, // da.airport_code = ?

        // Arrival search parameters
        arrivalCity ? `%${arrivalCity}%` : null, // aa.city_name LIKE ?
        arrivalCity ? `%${arrivalCity}%` : null, // aa.airport_name LIKE ?
        arrivalCity || null, // aa.airport_code = ?

        // Stop city parameter (optional)
        null, // ? IS NULL for stop filter
        null, // sa2.city_name LIKE ? (will be set if stop is provided)
        null, // sa2.airport_name LIKE ?
        null, // sa2.airport_code = ?
      ];

      console.log(
        "📝 Using searchMultiCityFlights query with params:",
        queryParams
      );
    } else if (tripType === "ROUND_TRIP") {
      // Use special round-trip query
      queryToUse = queries.searchRoundTripFlights;
      queryParams = [
        // First direction: departureCity → arrivalCity
        departureCity || null,
        departureCity ? `%${departureCity}%` : null, // city_name LIKE
        departureCity ? `%${departureCity}%` : null, // airport_name LIKE
        departureCity || null, // airport_code =
        arrivalCity || null,
        arrivalCity ? `%${arrivalCity}%` : null, // city_name LIKE
        arrivalCity ? `%${arrivalCity}%` : null, // airport_name LIKE
        arrivalCity || null, // airport_code =

        // Second direction: arrivalCity → departureCity
        arrivalCity || null,
        arrivalCity ? `%${arrivalCity}%` : null, // city_name LIKE
        arrivalCity ? `%${arrivalCity}%` : null, // airport_name LIKE
        arrivalCity || null, // airport_code =
        departureCity || null,
        departureCity ? `%${departureCity}%` : null, // city_name LIKE
        departureCity ? `%${departureCity}%` : null, // airport_name LIKE
        departureCity || null, // airport_code =
      ];

      console.log(
        "📝 Using searchRoundTripFlights query with params:",
        queryParams
      );
    } else {
      // Use regular one-way query
      queryToUse = queries.searchFlightsChatbot;
      queryParams = [
        // Departure search parameters (matches query placeholders 1-3)
        departureCity ? `%${departureCity}%` : null, // da.city_name LIKE ?
        departureCity ? `%${departureCity}%` : null, // da.airport_name LIKE ?
        departureCity || null, // da.airport_code = ?

        // Arrival search parameters (matches query placeholders 4-6)
        arrivalCity ? `%${arrivalCity}%` : null, // aa.city_name LIKE ?
        arrivalCity ? `%${arrivalCity}%` : null, // aa.airport_name LIKE ?
        arrivalCity || null, // aa.airport_code = ?

        // Date parameters (matches query placeholders 7-8)
        date || null, // DATE(flights.departure_time) = ?
        date || null, // ? IS NULL

        // Trip type parameters (matches query placeholders 9-10)
        tripType || null, // flights.trip_type = ?
        tripType || null, // ? IS NULL
      ];

      console.log(
        "📝 Using searchFlightsChatbot query with params:",
        queryParams
      );
    }

    const [rows] = await dbPool.query(queryToUse, queryParams);
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
    let flights;

    if (tripType === "ROUND_TRIP") {
      // For round-trip, keep individual flights but add group info for display
      flights = rows.map((flight, index) => ({
        flightId: flight.flight_id || "N/A",
        flightNumber: flight.flight_number || "N/A",
        airline: flight.airline_name || "N/A",
        tripType: "ROUND_TRIP",
        roundTripGroupId: flight.round_trip_group_id,
        departureAirport: flight.departure_airport_name || "N/A",
        departureCode: flight.departure_airport_code || "N/A",
        departureCity: flight.departure_city_name || "N/A",
        arrivalAirport: flight.arrival_airport_name || "N/A",
        arrivalCode: flight.arrival_airport_code || "N/A",
        arrivalCity: flight.arrival_city_name || "N/A",
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
          : "Liên hệ",
      }));

      // Group flights for markdown display
      groupedFlights = {};
      rows.forEach((flight) => {
        const groupId = flight.round_trip_group_id;
        if (!groupedFlights[groupId]) {
          groupedFlights[groupId] = [];
        }
        groupedFlights[groupId].push(flight);
      });
    } else if (tripType === "MULTI_CITY") {
      // Format multi-city flights with stops information
      flights = rows.map((flight, index) => ({
        flightId: flight.flight_id || "N/A",
        flightNumber: flight.flight_number || "N/A",
        airline: flight.airline_name || "N/A",
        tripType: "MULTI_CITY",
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
          : "Liên hệ",
        stopsInfo: flight.stops_info || "Không có thông tin điểm dừng",
      }));
    } else {
      // Format one-way flights
      flights = rows.map((flight, index) => ({
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
    }

    // Create detailed markdown message
    let markdownMessage = `## ✈️ Kết quả tìm kiếm chuyến bay\n\n`;
    markdownMessage += `**Tuyến bay:** ${departureCity || "N/A"} → ${
      arrivalCity || "N/A"
    }\n`;
    markdownMessage += `**Loại chuyến:** ${
      tripType === "ROUND_TRIP"
        ? "Khứ hồi"
        : tripType === "MULTI_CITY"
        ? "Đa chặng"
        : "Một chiều"
    }\n`;
    markdownMessage += `**Số chuyến bay tìm thấy:** ${
      tripType === "ROUND_TRIP"
        ? groupedFlights
          ? Object.keys(groupedFlights).length
          : 0
        : flights.length
    }\n\n`;

    if (flights.length > 0) {
      markdownMessage += `### 📋 Danh sách chuyến bay:\n\n`;

      if (tripType === "ROUND_TRIP") {
        // Use grouped flights for display
        const groupIds = Object.keys(groupedFlights);

        groupIds.forEach((groupId, index) => {
          const groupFlights = groupedFlights[groupId];
          groupFlights.sort(
            (a, b) => new Date(a.departure_time) - new Date(b.departure_time)
          );

          const outbound = groupFlights[0];
          const returnFlight = groupFlights[1];

          markdownMessage += `**${index + 1}. Gói khứ hồi ${groupId}**\n`;
          const totalPrice =
            (outbound?.base_price || 0) + (returnFlight?.base_price || 0);
          markdownMessage += `**Tổng giá:** ${totalPrice.toLocaleString(
            "vi-VN"
          )} ₫\n\n`;

          if (outbound) {
            markdownMessage += `**🏠 Chiều đi:** ${outbound.flight_number} - ${outbound.airline_name}\n`;
            markdownMessage += `- **Từ:** ${outbound.departure_city_name} (${outbound.departure_airport_name} - ${outbound.departure_airport_code})\n`;
            markdownMessage += `- **Đến:** ${outbound.arrival_city_name} (${outbound.arrival_airport_name} - ${outbound.arrival_airport_code})\n`;
            markdownMessage += `- **Giờ khởi hành:** ${
              outbound.departure_time
                ? new Date(outbound.departure_time).toLocaleTimeString(
                    "vi-VN",
                    { hour: "2-digit", minute: "2-digit" }
                  )
                : "N/A"
            }\n`;
            markdownMessage += `- **Giờ đến:** ${
              outbound.arrival_time
                ? new Date(outbound.arrival_time).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "N/A"
            }\n`;
            markdownMessage += `- **Giá vé:** ${
              outbound.base_price
                ? `${outbound.base_price.toLocaleString("vi-VN")} ₫`
                : "Liên hệ"
            }\n\n`;
          }

          if (returnFlight) {
            markdownMessage += `**🏠 Chiều về:** ${returnFlight.flight_number} - ${returnFlight.airline_name}\n`;
            markdownMessage += `- **Từ:** ${returnFlight.departure_city_name} (${returnFlight.departure_airport_name} - ${returnFlight.departure_airport_code})\n`;
            markdownMessage += `- **Đến:** ${returnFlight.arrival_city_name} (${returnFlight.arrival_airport_name} - ${returnFlight.arrival_airport_code})\n`;
            markdownMessage += `- **Giờ khởi hành:** ${
              returnFlight.departure_time
                ? new Date(returnFlight.departure_time).toLocaleTimeString(
                    "vi-VN",
                    { hour: "2-digit", minute: "2-digit" }
                  )
                : "N/A"
            }\n`;
            markdownMessage += `- **Giờ đến:** ${
              returnFlight.arrival_time
                ? new Date(returnFlight.arrival_time).toLocaleTimeString(
                    "vi-VN",
                    { hour: "2-digit", minute: "2-digit" }
                  )
                : "N/A"
            }\n`;
            markdownMessage += `- **Giá vé:** ${
              returnFlight.base_price
                ? `${returnFlight.base_price.toLocaleString("vi-VN")} ₫`
                : "Liên hệ"
            }\n\n`;
          }

          markdownMessage += `---\n\n`;
        });
      } else if (tripType === "MULTI_CITY") {
        flights.forEach((flight, index) => {
          markdownMessage += `**${index + 1}. ${flight.flightNumber}** - ${
            flight.airline
          } (Đa chặng)\n`;
          markdownMessage += `- **Từ:** ${flight.departureAirport} (${flight.departureCode})\n`;
          markdownMessage += `- **Đến:** ${flight.arrivalAirport} (${flight.arrivalCode})\n`;
          markdownMessage += `- **Giờ khởi hành:** ${flight.departureTime}\n`;
          markdownMessage += `- **Giờ đến:** ${flight.arrivalTime}\n`;
          markdownMessage += `- **Điểm dừng:** ${flight.stopsInfo}\n`;
          markdownMessage += `- **Giá vé:** ${flight.price}\n\n`;
        });
      } else {
        flights.forEach((flight, index) => {
          markdownMessage += `**${index + 1}. ${flight.flightNumber}** - ${
            flight.airline
          }\n`;
          markdownMessage += `- **Từ:** ${flight.departureAirport} (${flight.departureCode})\n`;
          markdownMessage += `- **Đến:** ${flight.arrivalAirport} (${flight.arrivalCode})\n`;
          markdownMessage += `- **Giờ khởi hành:** ${flight.departureTime}\n`;
          markdownMessage += `- **Giờ đến:** ${flight.arrivalTime}\n`;
          markdownMessage += `- **Giá vé:** ${flight.price}\n\n`;
        });
      }

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
