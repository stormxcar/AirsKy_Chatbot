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

  // Kiểm tra đầy đủ thông tin cần thiết trước khi tìm chuyến bay
  // Luôn yêu cầu cả ngày cụ thể và chiều đi (one-way/round-trip)
  if (!departureCity || !arrivalCity) {
    return {
      type: "text",
      message:
        "Để tìm chuyến bay, bạn hãy cho tôi biết điểm đi và điểm đến nhé!",
      data: [],
    };
  }

  if (!date) {
    return {
      type: "text",
      message: `Bạn muốn bay từ ${departureCity} đến ${arrivalCity} vào ngày nào? Vui lòng cho tôi biết ngày cụ thể (ví dụ: ngày 15 tháng 11).`,
      data: [],
    };
  }

  // Kiểm tra trip_type - phải có giá trị rõ ràng (ONE_WAY hoặc ROUND_TRIP)
  const validTripTypes = ["ONE_WAY", "ROUND_TRIP"];
  if (!entities.trip_type || !validTripTypes.includes(entities.trip_type)) {
    return {
      type: "text",
      message: `Bạn muốn bay một chiều hay khứ hồi từ ${departureCity} đến ${arrivalCity} vào ngày ${date}? Vui lòng trả lời "một chiều" hoặc "khứ hồi".`,
      data: [],
    };
  }

  // Nếu là khứ hồi nhưng thiếu ngày về
  if (tripType === "ROUND_TRIP" && !entities.return_date) {
    return {
      type: "text",
      message: `Bạn muốn về vào ngày nào? Vui lòng cho tôi biết ngày về cụ thể.`,
      data: [],
    };
  }

  try {
    let queryToUse, queryParams;
    let rows; // Declare rows outside the conditional blocks

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
      // For round-trip: Search for two separate one-way flights
      // This gives users more flexibility to choose different times for outbound and return

      // Search outbound flights (departure → arrival)
      const outboundQuery = queries.searchFlightsChatbot;
      const outboundParams = [
        departureCity ? `%${departureCity}%` : null,
        departureCity ? `%${departureCity}%` : null,
        departureCity || null,
        arrivalCity ? `%${arrivalCity}%` : null,
        arrivalCity ? `%${arrivalCity}%` : null,
        arrivalCity || null,
        date || null,
        date || null,
        "ONE_WAY", // Search for one-way flights
        "ONE_WAY",
      ];

      // Search return flights (arrival → departure)
      const returnQuery = queries.searchFlightsChatbot;
      const returnParams = [
        arrivalCity ? `%${arrivalCity}%` : null,
        arrivalCity ? `%${arrivalCity}%` : null,
        arrivalCity || null,
        departureCity ? `%${departureCity}%` : null,
        departureCity ? `%${departureCity}%` : null,
        departureCity || null,
        entities.return_date || null,
        entities.return_date || null,
        "ONE_WAY", // Search for one-way flights
        "ONE_WAY",
      ];

      console.log("📝 Searching round-trip as two one-way flights");
      console.log("📝 Outbound params:", outboundParams);
      console.log("📝 Return params:", returnParams);

      // Debug: Check available cities in database
      try {
        const [cityResults] = await dbPool.query(`
          SELECT DISTINCT city_name, airport_name, airport_code 
          FROM airports 
          WHERE city_name LIKE '%Hà Nội%' OR city_name LIKE '%Hồ Chí Minh%' 
          OR city_name LIKE '%Sài Gòn%' OR city_name LIKE '%HCMC%'
        `);
        console.log("🏙️ Available cities in database:", cityResults);
      } catch (cityError) {
        console.error("❌ Error checking cities:", cityError);
      }

      // Execute both queries
      const [outboundResults] = await dbPool.query(
        outboundQuery,
        outboundParams
      );
      const [returnResults] = await dbPool.query(returnQuery, returnParams);

      console.log("✈️ Found outbound flights:", outboundResults.length);
      console.log("✈️ Found return flights:", returnResults.length);

      // Debug: Log first few results to see data structure
      if (outboundResults.length > 0) {
        console.log("🔍 Sample outbound flight:", outboundResults[0]);
      }
      if (returnResults.length > 0) {
        console.log("🔍 Sample return flight:", returnResults[0]);
      }

      // Combine results with direction indicator
      const combinedResults = [
        ...outboundResults.map((flight) => ({
          ...flight,
          direction: "outbound",
        })),
        ...returnResults.map((flight) => ({ ...flight, direction: "return" })),
      ];

      // Set rows for round-trip
      rows = combinedResults;
      queryToUse = "ROUND_TRIP_COMBINED";
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

    // Execute database query based on trip type
    if (tripType === "MULTI_CITY") {
      [rows] = await dbPool.query(queryToUse, queryParams);
      console.log("📝 Multi-city query executed");
    } else if (tripType === "ROUND_TRIP") {
      // rows is already set above for round-trip
      console.log("📝 Using combined round-trip results");
    } else {
      // Execute database query for one-way
      [rows] = await dbPool.query(queryToUse, queryParams);
    }

    console.log("✈️ Found flights before filtering:", rows.length);

    // Filter flights to only show those departing at least 4 hours from now
    const now = new Date();
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const filteredRows = rows.filter((flight) => {
      if (!flight.departure_time) return false;
      const departureTime = new Date(flight.departure_time);
      return departureTime >= fourHoursFromNow;
    });

    console.log(
      "✈️ Found flights after filtering (4+ hours from now):",
      filteredRows.length
    );

    if (filteredRows.length === 0) {
      return {
        type: "flights",
        message: `Không tìm thấy chuyến bay từ ${
          departureCity || "điểm đi"
        } đến ${arrivalCity || "điểm đến"}${
          date ? ` vào ngày ${date}` : ""
        } khởi hành cách thời điểm hiện tại ít nhất 4 tiếng. Vui lòng thử ngày khác hoặc liên hệ hotline.`,
        data: [],
      };
    }

    // Format flight data with markdown
    let flights;

    if (tripType === "ROUND_TRIP") {
      // For round-trip, separate outbound and return flights
      const outboundFlights = filteredRows
        .filter((flight) => flight.direction === "outbound")
        .map((flight, index) => ({
          flightId: flight.flight_id || "N/A",
          flightNumber: flight.flight_number || "N/A",
          airline: flight.airline_name || "N/A",
          tripType: "ROUND_TRIP", // Set as round-trip for proper template handling
          direction: "outbound",
          departureAirport: flight.departure_airport_name || "N/A",
          departureCode: flight.departure_airport_code || "N/A",
          departureCity: flight.departure_city_name || "N/A",
          arrivalAirport: flight.arrival_airport_name || "N/A",
          arrivalCode: flight.arrival_airport_code || "N/A",
          arrivalCity: flight.arrival_city_name || "N/A",
          departureTime: flight.departure_time || null,
          arrivalTime: flight.arrival_time || null,
          aircraft: flight.aircraft_name || "N/A",
          price: flight.base_price
            ? `${flight.base_price.toLocaleString("vi-VN")} ₫`
            : "Liên hệ",
          duration: flight.duration || 120,
        }));

      const returnFlights = filteredRows
        .filter((flight) => flight.direction === "return")
        .map((flight, index) => ({
          flightId: flight.flight_id || "N/A",
          flightNumber: flight.flight_number || "N/A",
          airline: flight.airline_name || "N/A",
          tripType: "ROUND_TRIP", // Set as round-trip for proper template handling
          direction: "return",
          departureAirport: flight.departure_airport_name || "N/A",
          departureCode: flight.departure_airport_code || "N/A",
          departureCity: flight.departure_city_name || "N/A",
          arrivalAirport: flight.arrival_airport_name || "N/A",
          arrivalCode: flight.arrival_airport_code || "N/A",
          arrivalCity: flight.arrival_city_name || "N/A",
          departureTime: flight.departure_time || null,
          arrivalTime: flight.arrival_time || null,
          aircraft: flight.aircraft_name || "N/A",
          price: flight.base_price
            ? `${flight.base_price.toLocaleString("vi-VN")} ₫`
            : "Liên hệ",
          duration: flight.duration || 120,
        }));

      // Combine both directions for display
      flights = [...outboundFlights, ...returnFlights];

      console.log(
        `✈️ Round-trip results: ${outboundFlights.length} outbound, ${returnFlights.length} return`
      );
    } else if (tripType === "MULTI_CITY") {
      // Format multi-city flights with stops information
      flights = filteredRows.map((flight, index) => ({
        flightId: flight.flight_id || "N/A",
        flightNumber: flight.flight_number || "N/A",
        airline: flight.airline_name || "N/A",
        tripType: "MULTI_CITY",
        departureAirport: flight.departure_airport_name || "N/A",
        departureCode: flight.departure_airport_code || "N/A",
        arrivalAirport: flight.arrival_airport_name || "N/A",
        arrivalCode: flight.arrival_airport_code || "N/A",
        departureTime: flight.departure_time || null,
        arrivalTime: flight.arrival_time || null,
        aircraft: flight.aircraft_name || "N/A",
        price: flight.base_price
          ? `${flight.base_price.toLocaleString("vi-VN")} ₫`
          : "Liên hệ",
        stopsInfo: flight.stops_info || "Không có thông tin điểm dừng",
      }));
    } else {
      // Format one-way flights
      flights = filteredRows.map((flight, index) => ({
        flightId: flight.flight_id || "N/A",
        flightNumber: flight.flight_number || "N/A",
        airline: flight.airline_name || "N/A",
        tripType: flight.trip_type || "One-way",
        departureAirport: flight.departure_airport_name || "N/A",
        departureCode: flight.departure_airport_code || "N/A",
        arrivalAirport: flight.arrival_airport_name || "N/A",
        arrivalCode: flight.arrival_airport_code || "N/A",
        departureTime: flight.departure_time || null,
        arrivalTime: flight.arrival_time || null,
        aircraft: flight.aircraft_name || "N/A",
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
    markdownMessage += `**Số chuyến bay tìm thấy:** ${flights.length}\n\n`;

    if (flights.length > 0) {
      markdownMessage += `### 📋 Danh sách chuyến bay:\n\n`;

      if (tripType === "ROUND_TRIP") {
        // Separate outbound and return flights display
        const outboundFlights = flights.filter(
          (f) => f.direction === "outbound"
        );
        const returnFlights = flights.filter((f) => f.direction === "return");

        if (outboundFlights.length > 0) {
          markdownMessage += `#### 🛫 Chuyến đi (${departureCity} → ${arrivalCity}):\n\n`;
          outboundFlights.forEach((flight, index) => {
            markdownMessage += `**${index + 1}. ${flight.flightNumber}** - ${
              flight.airline
            }\n`;
            markdownMessage += `- ${flight.departureCode} → ${flight.arrivalCode}\n`;
            markdownMessage += `- ${flight.departureTime} - ${flight.arrivalTime}\n`;
            markdownMessage += `- **${flight.price}**\n\n`;
          });
        }

        if (returnFlights.length > 0) {
          markdownMessage += `#### 🛬 Chuyến về (${arrivalCity} → ${departureCity}):\n\n`;
          returnFlights.forEach((flight, index) => {
            markdownMessage += `**${index + 1}. ${flight.flightNumber}** - ${
              flight.airline
            }\n`;
            markdownMessage += `- ${flight.departureCode} → ${flight.arrivalCode}\n`;
            markdownMessage += `- ${flight.departureTime} - ${flight.arrivalTime}\n`;
            markdownMessage += `- **${flight.price}**\n\n`;
          });
        }

        markdownMessage += `\n💡 **Hướng dẫn:** Chọn một chuyến đi và một chuyến về riêng biệt để tạo vé khứ hồi hoàn chỉnh.\n\n`;
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
