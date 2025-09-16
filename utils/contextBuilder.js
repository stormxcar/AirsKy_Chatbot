const { extractDateFromMessage } = require("./entityExtractor");
const { getLangChainSQLManager } = require("./langchainSQL");

// Global LangChain SQL Manager instance
let sqlManager = null;

/**
 * Initialize LangChain SQL Manager
 * @param {Object} dbPool - Database connection pool
 * @returns {Object} Initialized SQL Manager
 */
function initializeSQLManager(dbPool) {
  if (!sqlManager) {
    sqlManager = getLangChainSQLManager(dbPool);
  }
  return sqlManager;
}

/**
 * Build smart context for flight search
 * @param {string} userId - User identifier
 * @param {string} message - User's query message
 * @param {Object} dbPool - Database connection pool
 * @param {Object} entities - Extracted entities from message
 * @returns {Object} Context object with type, message, and data
 */
async function buildSmartContext(userId, message, dbPool, entities) {
  console.log("🔍 Building context for:", message);
  console.log("🔍 Entities:", entities);

  // Initialize SQL Manager
  if (!sqlManager) {
    sqlManager = initializeSQLManager(dbPool);
    await sqlManager.initialize();
  }

  const departureCity = entities.departure || null;
  const arrivalCity = entities.arrival || null;
  const date = entities.date || extractDateFromMessage(message);
  const returnDate = entities.return_date || null;
  const tripType = entities.trip_type || "ONE_WAY";

  // Validate input
  if (!departureCity && !arrivalCity && !date) {
    return {
      type: "text",
      message:
        "Để tìm chuyến bay, bạn hãy cho tôi biết điểm đi và điểm đến nhé!",
      data: [],
    };
  }

  try {
    // Build and execute natural language query
    const naturalLanguageQuery = buildNaturalLanguageQuery({
      departureCity,
      arrivalCity,
      date,
      returnDate,
      tripType,
      message,
    });
    console.log("🤖 Generated natural language query:", naturalLanguageQuery);

    const queryResult = await sqlManager.executeNaturalLanguageQuery(
      naturalLanguageQuery,
      {
        userId,
        entities,
        message,
      }
    );

    if (!queryResult.success) {
      console.error("❌ LangChain query failed:", queryResult.error);
      return {
        type: "text",
        message:
          "Xin lỗi, tôi không thể tìm thấy thông tin chuyến bay phù hợp. Vui lòng thử lại với thông tin khác.",
        data: [],
      };
    }

    // Process results
    const flights = processFlightResults(queryResult.result, tripType);
    if (flights.length === 0) {
      return {
        type: "flights",
        message: `Không tìm thấy chuyến bay từ ${
          departureCity || "điểm đi"
        } đến ${arrivalCity || "điểm đến"}${date ? ` ngày đi ${date}` : ""}${
          returnDate ? ` ngày về ${returnDate}` : ""
        }. Vui lòng thử ngày khác hoặc liên hệ hotline.`,
        data: [],
      };
    }

    // Fill missing city information
    flights.forEach((flight) => {
      fillFlightCityInfo(flight, departureCity, arrivalCity);
    });

    // Group round-trip flights if needed
    const groupedFlights =
      tripType === "ROUND_TRIP" ? groupRoundTripFlights(flights) : null;

    // Generate markdown message
    const markdownMessage = generateFlightMarkdown(
      flights,
      groupedFlights,
      departureCity,
      arrivalCity,
      date,
      returnDate,
      tripType
    );

    return {
      type: "flights",
      message: markdownMessage,
      data: flights,
    };
  } catch (error) {
    console.error("❌ Error in buildSmartContext:", error);
    return {
      type: "text",
      message:
        "Xin lỗi, có lỗi xảy ra khi tìm kiếm chuyến bay. Vui lòng thử lại sau.",
      data: [],
    };
  }
}

/**
 * Fill missing city information for flights
 * @param {Object} flight - Flight object to process
 * @param {string|null} departureCity - Departure city from entities
 * @param {string|null} arrivalCity - Arrival city from entities
 */
function fillFlightCityInfo(flight, departureCity, arrivalCity) {
  // Fill main departure/arrival cities for all trip types
  if (departureCity && flight.departureCity === "N/A") {
    flight.departureCity = departureCity;
  }
  if (arrivalCity && flight.arrivalCity === "N/A") {
    flight.arrivalCity = arrivalCity;
  }

  // Special handling for round-trip flights
  if (
    flight.tripType === "ROUND_TRIP" &&
    flight.flightDirection === "roundtrip"
  ) {
    // Fill outbound flight cities
    if (departureCity && flight.outboundFlight) {
      flight.outboundFlight.departureCity = departureCity;
      flight.outboundFlight.arrivalCity = arrivalCity;
    }
    // Fill return flight cities (swapped)
    if (arrivalCity && departureCity && flight.returnFlight) {
      flight.returnFlight.departureCity = arrivalCity;
      flight.returnFlight.arrivalCity = departureCity;
    }
  }

  // Fill cities from airport codes if still N/A
  if (flight.departureCity === "N/A" && flight.departureAirport !== "N/A") {
    flight.departureCity = extractCityFromAirportCode(flight.departureAirport);
  }
  if (flight.arrivalCity === "N/A" && flight.arrivalAirport !== "N/A") {
    flight.arrivalCity = extractCityFromAirportCode(flight.arrivalAirport);
  }

  // Handle multi-city stops
  if (flight.flightDirection === "multicity" && flight.stops) {
    flight.stops.forEach((stop) => {
      if (stop.departureAirport !== "N/A") {
        stop.departureCity = extractCityFromAirportCode(stop.departureAirport);
      }
      if (stop.arrivalAirport !== "N/A") {
        stop.arrivalCity = extractCityFromAirportCode(stop.arrivalAirport);
      }
    });
  }
}

/**
 * Build natural language query from entities
 * @param {Object} params - Search parameters
 * @returns {string} Natural language query
 */
function buildNaturalLanguageQuery({
  departureCity,
  arrivalCity,
  date,
  returnDate,
  tripType,
  message,
}) {
  let query = "Find flights";
  if (departureCity) query += ` from ${departureCity}`;
  if (arrivalCity) query += ` to ${arrivalCity}`;
  if (date) query += ` departing on ${date}`;
  if (returnDate && tripType === "ROUND_TRIP")
    query += ` returning on ${returnDate}`;
  query +=
    tripType === "ROUND_TRIP"
      ? " for round trip"
      : tripType === "MULTI_CITY"
      ? " for multi-city"
      : " for one way";
  if (message) query += `. Additional context: ${message}`;
  return query;
}

/**
 * Format price to VND
 * @param {string|number} price - Price value
 * @returns {string} Formatted price
 */
function formatPrice(price) {
  const priceValue =
    typeof price === "string"
      ? parseFloat(price.replace(/,/g, ""))
      : Number(price);
  return isNaN(priceValue)
    ? "Liên hệ"
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(priceValue);
}

/**
 * Process and format flight results
 * @param {Array} results - Raw database results
 * @param {string} tripType - Type of trip
 * @returns {Array} Formatted flight data
 */
function processFlightResults(results, tripType) {
  if (!results || !Array.isArray(results)) return [];

  return results.map((flight, index) => {
    // Handle multi-city flights
    if (
      flight.stops_info ||
      Array.isArray(flight.stops) ||
      tripType === "MULTI_CITY"
    ) {
      const stops = flight.stops_info
        ? parseStopsInfo(flight.stops_info)
        : Array.isArray(flight.stops)
        ? flight.stops.sort((a, b) => a.stop_order - b.stop_order)
        : []; // Empty array if no stops but tripType is MULTI_CITY
      const lastStop = stops[stops.length - 1] || {};

      return {
        flightId: `multicity_${flight.flight_id}`,
        flightNumber: flight.flight_number || flight.number || "N/A",
        airline: flight.airline_name || flight.airline || "N/A",
        tripType: "MULTI_CITY",
        departureAirport: flight.departure_airport_code || "N/A",
        departureCode: flight.departure_airport_code || "N/A",
        departureCity: flight.departure_city || "N/A",
        arrivalAirport:
          lastStop.arrival_airport_code || flight.arrival_airport_code || "N/A",
        arrivalCode:
          lastStop.arrival_airport_code || flight.arrival_airport_code || "N/A",
        arrivalCity: flight.arrival_city || "N/A",
        departureTime: flight.departure_time
          ? new Date(flight.departure_time).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        arrivalTime:
          lastStop.arrival_time || flight.arrival_time
            ? new Date(
                lastStop.arrival_time || flight.arrival_time
              ).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "N/A",
        price: formatPrice(flight.base_price || flight.price),
        flightDirection: "multicity",
        stops: stops.map((stop) => ({
          stopOrder: stop.stop_order || stop.stopOrder,
          departureAirport:
            stop.departure_airport_code || stop.departureAirport,
          arrivalAirport: stop.arrival_airport_code || stop.arrivalAirport,
          departureTime: stop.departure_time
            ? new Date(stop.departure_time).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "N/A",
          arrivalTime: stop.arrival_time
            ? new Date(stop.arrival_time).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "N/A",
          layoverTime: stop.layover_time || stop.layoverTime || "N/A",
          aircraftType: stop.aircraft_type || stop.aircraftType || "N/A",
        })),
        totalStops: stops.length,
        totalDuration: calculateTotalDuration(
          flight.departure_time,
          lastStop.arrival_time || flight.arrival_time
        ),
      };
    }

    // Handle round-trip flights
    if (flight.outbound_flight_id && flight.return_flight_id) {
      const outboundPrice = Number(flight.outbound_base_price || 0);
      const returnPrice = Number(flight.return_base_price || 0);
      const totalPrice = outboundPrice + returnPrice;

      return {
        flightId: `roundtrip_${flight.outbound_flight_id}-${flight.return_flight_id}`,
        flightNumber: `${flight.outbound_flight_number} / ${flight.return_flight_number}`,
        airline:
          flight.outbound_airline_name ||
          flight.return_airline_name ||
          flight.airline ||
          "N/A",
        tripType: "ROUND_TRIP",
        roundTripGroupId:
          flight.round_trip_group_id ||
          `RT_${flight.outbound_flight_id}_${flight.return_flight_id}`,
        // Fix: Use outbound departure and arrival airports/cities
        departureAirport:
          flight.outbound_departure_airport ||
          flight.outbound_departure_airport_code ||
          "N/A",
        departureCode: flight.outbound_departure_airport_code || "N/A",
        departureCity: flight.outbound_departure_city || "N/A",
        arrivalAirport:
          flight.outbound_arrival_airport ||
          flight.outbound_arrival_airport_code ||
          "N/A",
        arrivalCode: flight.outbound_arrival_airport_code || "N/A",
        arrivalCity: flight.outbound_arrival_city || "N/A",
        departureTime: flight.outbound_departure_time
          ? new Date(flight.outbound_departure_time).toLocaleTimeString(
              "vi-VN",
              { hour: "2-digit", minute: "2-digit" }
            )
          : "N/A",
        arrivalTime: flight.outbound_arrival_time
          ? new Date(flight.outbound_arrival_time).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        price: totalPrice > 0 ? formatPrice(totalPrice) : "Liên hệ",
        flightDirection: "roundtrip",
        outboundFlight: {
          flightId: flight.outbound_flight_id,
          flightNumber: flight.outbound_flight_number,
          airline: flight.outbound_airline_name || "N/A",
          departureTime: flight.outbound_departure_time,
          arrivalTime: flight.outbound_arrival_time,
          price: flight.outbound_base_price,
          departureAirport: flight.outbound_departure_airport_code,
          arrivalAirport: flight.outbound_arrival_airport_code,
          departureCity: flight.outbound_departure_city,
          arrivalCity: flight.outbound_arrival_city,
        },
        returnFlight: {
          flightId: flight.return_flight_id,
          flightNumber: flight.return_flight_number,
          airline: flight.return_airline_name || "N/A",
          departureTime: flight.return_departure_time,
          arrivalTime: flight.return_arrival_time,
          price: flight.return_base_price,
          departureAirport: flight.return_departure_airport_code,
          arrivalAirport: flight.return_arrival_airport_code,
          departureCity: flight.return_departure_city,
          arrivalCity: flight.return_arrival_city,
        },
      };
    }

    // Handle one-way flights
    return {
      flightId: `oneway_${flight.flight_id}`,
      flightNumber: flight.flight_number || flight.number || "N/A",
      airline: flight.airline_name || flight.airline || "N/A",
      tripType,
      roundTripGroupId: flight.round_trip_group_id || null,
      departureAirport:
        flight.departure_airport_name || flight.departure_airport || "N/A",
      departureCode:
        flight.departure_airport_code || flight.departure_code || "N/A",
      departureCity:
        flight.departure_city_name || flight.departure_city || "N/A",
      arrivalAirport:
        flight.arrival_airport_name || flight.arrival_airport || "N/A",
      arrivalCode: flight.arrival_airport_code || flight.arrival_code || "N/A",
      arrivalCity: flight.arrival_city_name || flight.arrival_city || "N/A",
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
      price: formatPrice(flight.base_price || flight.price),
      flightDirection: flight.flight_direction || "outbound",
    };
  });
}

/**
 * Group round-trip flights by group ID
 * @param {Array} flights - Array of flight objects
 * @returns {Object} Grouped flights
 */
function groupRoundTripFlights(flights) {
  const grouped = {};
  flights.forEach((flight) => {
    const groupId = flight.roundTripGroupId;
    if (!grouped[groupId]) grouped[groupId] = [];
    grouped[groupId].push(flight);
  });

  // Sort flights within each group by departure time
  Object.keys(grouped).forEach((groupId) => {
    grouped[groupId].sort(
      (a, b) => new Date(a.departureTime) - new Date(b.departureTime)
    );
  });

  return grouped;
}

/**
 * Generate detailed markdown message for flights
 * @param {Array} flights - Formatted flight data
 * @param {Object} groupedFlights - Grouped round-trip flights
 * @param {string} departureCity - Departure city
 * @param {string} arrivalCity - Arrival city
 * @param {string} date - Departure date
 * @param {string} returnDate - Return date
 * @param {string} tripType - Type of trip
 * @returns {string} Markdown message
 */
function generateFlightMarkdown(
  flights,
  groupedFlights,
  departureCity,
  arrivalCity,
  date,
  returnDate,
  tripType
) {
  let markdownMessage = `## ✈️ Kết quả tìm kiếm chuyến bay\n\n`;
  markdownMessage += `**Tuyến bay:** ${departureCity || "N/A"} → ${
    arrivalCity || "N/A"
  }\n`;
  markdownMessage += `**Loại chuyến:** ${
    tripType === "ROUND_TRIP"
      ? "Khứ hồi"
      : tripType === "MULTI_CITY"
      ? "Đa thành phố"
      : "Một chiều"
  }\n`;
  if (date) markdownMessage += `**Ngày đi:** ${date}\n`;
  if (returnDate && tripType === "ROUND_TRIP")
    markdownMessage += `**Ngày về:** ${returnDate}\n`;
  markdownMessage += `**Số chuyến bay tìm thấy:** ${
    tripType === "ROUND_TRIP"
      ? groupedFlights
        ? Object.keys(groupedFlights).length
        : 0
      : flights.length
  }\n\n`;

  if (flights.length > 0) {
    markdownMessage += `### 📋 Danh sách chuyến bay:\n\n`;

    if (tripType === "MULTI_CITY") {
      flights.forEach((flight, index) => {
        if (flight.tripType === "MULTI_CITY" && flight.stops) {
          markdownMessage += `**${index + 1}. ${flight.flightNumber}** - ${
            flight.airline
          }\n`;
          markdownMessage += `- **Từ:** ${flight.departureCity} (${flight.departureAirport})\n`;
          markdownMessage += `- **Đến:** ${flight.arrivalCity} (${flight.arrivalAirport})\n`;
          markdownMessage += `- **Thời gian bay:** ${flight.totalDuration}\n`;
          markdownMessage += `- **Số điểm dừng:** ${flight.totalStops}\n`;
          markdownMessage += `- **Giá vé:** ${flight.price}\n\n`;
          markdownMessage += `**📍 Chi tiết hành trình:**\n`;
          flight.stops.forEach((stop, stopIndex) => {
            markdownMessage += `  ${stopIndex + 1}. **${
              stop.departureAirport
            }** → **${stop.arrivalAirport}**\n`;
            markdownMessage += `     - Khởi hành: ${stop.departureTime}\n`;
            markdownMessage += `     - Đến: ${stop.arrivalTime}\n`;
            if (
              stop.layoverTime !== "N/A" &&
              stopIndex < flight.stops.length - 1
            ) {
              markdownMessage += `     - Thời gian chờ: ${stop.layoverTime}\n`;
            }
            if (stop.aircraftType !== "N/A") {
              markdownMessage += `     - Máy bay: ${stop.aircraftType}\n`;
            }
            markdownMessage += `\n`;
          });
          markdownMessage += `---\n\n`;
        }
      });
    } else if (tripType === "ROUND_TRIP" && groupedFlights) {
      Object.keys(groupedFlights).forEach((groupId, index) => {
        const [outbound, returnFlight] = groupedFlights[groupId];
        markdownMessage += `**${index + 1}. Gói khứ hồi ${groupId}**\n`;
        const totalPrice = (
          Number(outbound?.price?.replace(/[^\d]/g, "") || 0) +
          Number(returnFlight?.price?.replace(/[^\d]/g, "") || 0)
        ).toLocaleString("vi-VN");
        markdownMessage += `**Tổng giá:** ${totalPrice} ₫\n\n`;

        if (outbound) {
          markdownMessage += `**🏠 Chiều đi:** ${outbound.flightNumber} - ${outbound.airline}\n`;
          markdownMessage += `- **Từ:** ${outbound.departureCity} (${outbound.departureAirport} - ${outbound.departureCode})\n`;
          markdownMessage += `- **Đến:** ${outbound.arrivalCity} (${outbound.arrivalAirport} - ${outbound.arrivalCode})\n`;
          markdownMessage += `- **Giờ khởi hành:** ${outbound.departureTime}\n`;
          markdownMessage += `- **Giờ đến:** ${outbound.arrivalTime}\n`;
          markdownMessage += `- **Giá vé:** ${outbound.price}\n\n`;
        }

        if (returnFlight) {
          markdownMessage += `**🏠 Chiều về:** ${returnFlight.flightNumber} - ${returnFlight.airline}\n`;
          markdownMessage += `- **Từ:** ${returnFlight.departureCity} (${returnFlight.departureAirport} - ${returnFlight.departureCode})\n`;
          markdownMessage += `- **Đến:** ${returnFlight.arrivalCity} (${returnFlight.arrivalAirport} - ${returnFlight.arrivalCode})\n`;
          markdownMessage += `- **Giờ khởi hành:** ${returnFlight.departureTime}\n`;
          markdownMessage += `- **Giờ đến:** ${returnFlight.arrivalTime}\n`;
          markdownMessage += `- **Giá vé:** ${returnFlight.price}\n\n`;
        }

        markdownMessage += `---\n\n`;
      });
    } else if (tripType === "ROUND_TRIP") {
      flights.forEach((flight, index) => {
        if (
          flight.flightDirection === "roundtrip" &&
          flight.outboundFlight &&
          flight.returnFlight
        ) {
          markdownMessage += `**${index + 1}. Gói khứ hồi ${
            flight.roundTripGroupId || flight.flightId
          }**\n`;
          markdownMessage += `**Tổng giá:** ${flight.price}\n\n`;

          const outbound = flight.outboundFlight;
          markdownMessage += `**🏠 Chiều đi:** ${outbound.flightNumber} - ${flight.airline}\n`;
          markdownMessage += `- **Giờ khởi hành:** ${
            outbound.departureTime
              ? new Date(outbound.departureTime).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A"
          }\n`;
          markdownMessage += `- **Giờ đến:** ${
            outbound.arrivalTime
              ? new Date(outbound.arrivalTime).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A"
          }\n`;
          markdownMessage += `- **Giá vé:** ${
            outbound.price ? formatPrice(outbound.price) : "Liên hệ"
          }\n\n`;

          const returnFlight = flight.returnFlight;
          markdownMessage += `**🏠 Chiều về:** ${returnFlight.flightNumber} - ${flight.airline}\n`;
          markdownMessage += `- **Giờ khởi hành:** ${
            returnFlight.departureTime
              ? new Date(returnFlight.departureTime).toLocaleTimeString(
                  "vi-VN",
                  { hour: "2-digit", minute: "2-digit" }
                )
              : "N/A"
          }\n`;
          markdownMessage += `- **Giờ đến:** ${
            returnFlight.arrivalTime
              ? new Date(returnFlight.arrivalTime).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A"
          }\n`;
          markdownMessage += `- **Giá vé:** ${
            returnFlight.price ? formatPrice(returnFlight.price) : "Liên hệ"
          }\n\n`;

          markdownMessage += `---\n\n`;
        }
      });
    } else {
      flights.forEach((flight, index) => {
        markdownMessage += `**${index + 1}. ${flight.flightNumber}** - ${
          flight.airline
        }\n`;
        markdownMessage += `- **Từ:** ${flight.departureCity} (${flight.departureAirport} - ${flight.departureCode})\n`;
        markdownMessage += `- **Đến:** ${flight.arrivalCity} (${flight.arrivalAirport} - ${flight.arrivalCode})\n`;
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

  return markdownMessage;
}

/**
 * Parse stops info string from GROUP_CONCAT into array format
 * @param {string} stopsInfo - GROUP_CONCAT result string
 * @returns {Array} Array of stop objects
 */
function parseStopsInfo(stopsInfo) {
  if (!stopsInfo || typeof stopsInfo !== "string") return [];

  const stops = [];
  const stopSegments = stopsInfo.split(" | ");

  for (const segment of stopSegments) {
    const stopMatch = segment.match(
      /Stop (\d+): (.+?) \((.+?)\), Arrival: (.+?), Departure: (.+?), Duration: (.+?) mins/
    );
    if (stopMatch) {
      const [, stopOrder, , airportCode, arrivalTime, departureTime, duration] =
        stopMatch;
      stops.push({
        stopOrder: parseInt(stopOrder),
        departureAirport: airportCode,
        arrivalAirport: airportCode,
        departureTime: departureTime
          ? new Date(departureTime).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        arrivalTime: arrivalTime
          ? new Date(arrivalTime).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        layoverTime: duration ? `${duration} mins` : "N/A",
        aircraftType: "N/A",
      });
    }
  }

  return stops.sort((a, b) => a.stopOrder - b.stopOrder);
}

/**
 * Calculate total duration between two times
 * @param {string} departureTime - Departure time
 * @param {string} arrivalTime - Arrival time
 * @returns {string} Formatted duration
 */
function calculateTotalDuration(departureTime, arrivalTime) {
  if (!departureTime || !arrivalTime) return "N/A";

  const depTime = new Date(departureTime);
  const arrTime = new Date(arrivalTime);

  if (isNaN(depTime.getTime()) || isNaN(arrTime.getTime())) return "N/A";

  const diffMs = arrTime - depTime;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return diffHours > 0 ? `${diffHours}h ${diffMinutes}m` : `${diffMinutes}m`;
}

/**
 * Extract city from airport code
 * @param {string} airportCode - Airport code
 * @returns {string} City name or "N/A"
 */
function extractCityFromAirportCode(airportCode) {
  if (!airportCode || airportCode === "N/A") return "N/A";

  const airportCityMap = {
    HAN: "Hà Nội",
    SGN: "Sài Gòn",
    DAD: "Đà Nẵng",
    HPH: "Hải Phòng",
    CXR: "Nha Trang",
    PQC: "Phú Quốc",
    VCA: "Cần Thơ",
    DLI: "Đà Lạt",
    UIH: "Quy Nhơn",
    VCL: "Chu Lai",
    TBB: "Tuy Hòa",
    THD: "Thanh Hóa",
    VII: "Vinh",
    HUI: "Huế",
    VDH: "Đồng Hới",
    PXU: "Pleiku",
    VKG: "Rạch Giá",
    CAH: "Cà Mau",
    VCS: "Côn Đảo",
    BMV: "Ban Mê Thuột",
    SIN: "Singapore",
    BKK: "Bangkok",
    KUL: "Kuala Lumpur",
    CGK: "Jakarta",
    DPS: "Denpasar",
    ICN: "Seoul",
    NRT: "Tokyo",
    HKG: "Hong Kong",
    PVG: "Shanghai",
    PEK: "Beijing",
    TPE: "Taipei",
    KIX: "Osaka",
    FUK: "Fukuoka",
  };

  return airportCityMap[airportCode.toUpperCase()] || "N/A";
}

module.exports = {
  buildSmartContext,
  buildNaturalLanguageQuery,
  processFlightResults,
  groupRoundTripFlights,
  generateFlightMarkdown,
  parseStopsInfo,
};
