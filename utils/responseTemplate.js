const logger = require("./logger");

/**
 * Professional Flight Response Template Builder
 * Creates comprehensive and user-friendly flight search responses
 */
class FlightResponseTemplate {
  constructor() {
    this.templates = {
      success: {
        oneway: this.buildOneWayTemplate.bind(this),
        roundtrip: this.buildRoundTripTemplate.bind(this),
        multicity: this.buildMultiCityTemplate.bind(this),
        noResults: this.buildNoResultsTemplate.bind(this),
      },
      error: {
        general: this.buildErrorTemplate.bind(this),
        apiError: this.buildApiErrorTemplate.bind(this),
      },
    };
  }

  /**
   * Main method to build flight response
   * @param {Object} flightData - Flight search results
   * @param {Object} queryContext - Original query context
   * @returns {Object} Formatted response
   */
  buildResponse(flightData, queryContext = {}) {
    try {
      const { flights, tripType, searchCriteria } = flightData;

      if (!flights || flights.length === 0) {
        return this.templates.success.noResults(queryContext);
      }

      // Group flights by trip type
      const groupedFlights = this.groupFlightsByType(flights);

      // Build response based on trip type
      switch (tripType) {
        case "ROUND_TRIP":
          return this.templates.success.roundtrip(groupedFlights, queryContext);
        case "MULTI_CITY":
          return this.templates.success.multicity(groupedFlights, queryContext);
        default:
          return this.templates.success.oneway(groupedFlights, queryContext);
      }
    } catch (error) {
      logger.error("Error building flight response:", error);
      return this.templates.error.general(error);
    }
  }

  /**
   * Group flights by their trip type
   * @param {Array} flights - Array of flight objects
   * @returns {Object} Grouped flights
   */
  groupFlightsByType(flights) {
    const grouped = {
      oneway: [],
      roundtrip: [],
      multicity: [],
    };

    flights.forEach((flight) => {
      const type =
        flight.tripType?.toLowerCase() ||
        flight.trip_type?.toLowerCase() ||
        "oneway";
      if (grouped[type]) {
        grouped[type].push(flight);
      } else {
        grouped.oneway.push(flight);
      }
    });

    return grouped;
  }

  /**
   * Build one-way flight template
   * @param {Object} groupedFlights - Grouped flight data
   * @param {Object} queryContext - Query context
   * @returns {Object} Formatted response
   */
  buildOneWayTemplate(groupedFlights, queryContext) {
    const flights = groupedFlights.oneway;
    const flightCount = flights.length;

    // Get search criteria from context
    const { departureCity, arrivalCity, date, passengers = 1 } = queryContext;

    let response = {
      type: "flight_results",
      tripType: "ONE_WAY",
      summary: {
        totalFlights: flightCount,
        message: this.buildSummaryMessage(flightCount, "oneway", queryContext),
        searchCriteria: {
          from: departureCity,
          to: arrivalCity,
          date: date,
          passengers: passengers,
        },
      },
      flights: flights.map((flight) => this.formatFlightCard(flight)),
      additionalInfo: this.buildAdditionalInfo(queryContext),
      suggestions: this.buildSuggestions(flights, queryContext),
    };

    return response;
  }

  /**
   * Build round-trip flight template
   * @param {Object} groupedFlights - Grouped flight data
   * @param {Object} queryContext - Query context
   * @returns {Object} Formatted response
   */
  buildRoundTripTemplate(groupedFlights, queryContext) {
    const flights = groupedFlights.roundtrip;
    const flightCount = flights.length;

    // Group roundtrip flights by their group ID
    const roundtripGroups = this.groupRoundTripFlights(flights);

    let response = {
      type: "flight_results",
      tripType: "ROUND_TRIP",
      summary: {
        totalFlights: flightCount,
        totalRoundTrips: roundtripGroups.length,
        message: this.buildSummaryMessage(
          flightCount,
          "roundtrip",
          queryContext
        ),
        searchCriteria: {
          from: queryContext.departureCity,
          to: queryContext.arrivalCity,
          outboundDate: queryContext.outboundDate,
          returnDate: queryContext.returnDate,
          passengers: queryContext.passengers || 1,
        },
      },
      flights: roundtripGroups.map((group) => this.formatRoundTripCard(group)),
      additionalInfo: this.buildAdditionalInfo(queryContext),
      suggestions: this.buildSuggestions(flights, queryContext),
    };

    return response;
  }

  /**
   * Build multi-city flight template
   * @param {Object} groupedFlights - Grouped flight data
   * @param {Object} queryContext - Query context
   * @returns {Object} Formatted response
   */
  buildMultiCityTemplate(groupedFlights, queryContext) {
    const flights = groupedFlights.multicity;
    const flightCount = flights.length;

    let response = {
      type: "flight_results",
      tripType: "MULTI_CITY",
      summary: {
        totalFlights: flightCount,
        message: this.buildSummaryMessage(
          flightCount,
          "multicity",
          queryContext
        ),
        searchCriteria: {
          routes: queryContext.routes || [],
          dates: queryContext.dates || [],
          passengers: queryContext.passengers || 1,
        },
      },
      flights: flights.map((flight) => this.formatMultiCityCard(flight)),
      additionalInfo: this.buildAdditionalInfo(queryContext),
      suggestions: this.buildSuggestions(flights, queryContext),
    };

    return response;
  }

  /**
   * Build no results template
   * @param {Object} queryContext - Query context
   * @returns {Object} Formatted response
   */
  buildNoResultsTemplate(queryContext) {
    return {
      type: "no_results",
      message: `Xin lỗi, chúng tôi không tìm thấy chuyến bay nào phù hợp với yêu cầu của bạn.`,
      suggestions: this.buildAlternativeSuggestions(queryContext),
      searchTips: this.buildSearchTips(),
    };
  }

  /**
   * Build summary message
   * @param {number} count - Number of flights
   * @param {string} type - Trip type
   * @param {Object} context - Query context
   * @returns {string} Summary message
   */
  buildSummaryMessage(count, type, context) {
    const { departureCity, arrivalCity, date } = context;

    let typeText = "";
    switch (type) {
      case "roundtrip":
        typeText = "khứ hồi";
        break;
      case "multicity":
        typeText = "đa chặng";
        break;
      default:
        typeText = "một chiều";
    }

    if (count === 0) {
      return `Chúng tôi không tìm thấy chuyến bay ${typeText} nào từ ${departureCity} đến ${arrivalCity}.`;
    } else if (count === 1) {
      return `Chúng tôi tìm thấy 1 chuyến bay ${typeText} từ ${departureCity} đến ${arrivalCity}${
        date ? ` vào ngày ${this.formatDate(date)}` : ""
      }.`;
    } else if (count < 5) {
      return `Chúng tôi tìm thấy ${count} chuyến bay ${typeText} từ ${departureCity} đến ${arrivalCity}${
        date ? ` vào ngày ${this.formatDate(date)}` : ""
      }.`;
    } else {
      return `Chúng tôi tìm thấy ${count} chuyến bay ${typeText} từ ${departureCity} đến ${arrivalCity}${
        date ? ` vào ngày ${this.formatDate(date)}` : ""
      }. Dưới đây là một số lựa chọn tốt nhất:`;
    }
  }

  /**
   * Format single flight card
   * @param {Object} flight - Flight data
   * @returns {Object} Formatted flight card
   */
  formatFlightCard(flight) {
    return {
      flightId: flight.flightId || flight.flight_id,
      flightNumber: flight.flightNumber || flight.flight_number,
      airline: flight.airline || flight.airline_name,
      tripType: flight.tripType || flight.trip_type || "ONE_WAY",
      departureAirport:
        flight.departureAirport || flight.departure_airport_name,
      departureCode: flight.departureCode || flight.departure_airport_code,
      arrivalAirport: flight.arrivalAirport || flight.arrival_airport_name,
      arrivalCode: flight.arrivalCode || flight.arrival_airport_code,
      departureTime: this.formatTime(
        flight.departureTime || flight.departure_time
      ),
      arrivalTime: this.formatTime(flight.arrivalTime || flight.arrival_time),
      price: this.formatPrice(flight.price || flight.base_price),
      duration: this.calculateDuration(
        flight.departureTime || flight.departure_time,
        flight.arrivalTime || flight.arrival_time
      ),
      stops: flight.stops || 0,
      aircraft: flight.aircraft || "N/A",
    };
  }

  /**
   * Format round-trip flight card
   * @param {Object} group - Round-trip flight group
   * @returns {Object} Formatted round-trip card
   */
  formatRoundTripCard(group) {
    const outbound = group.outbound;
    const returnFlight = group.return;

    return {
      flightId: `roundtrip-${outbound.flightId || outbound.flight_id}-${
        returnFlight.flightId || returnFlight.flight_id
      }`,
      flightNumber: `${outbound.flightNumber || outbound.flight_number} / ${
        returnFlight.flightNumber || returnFlight.flight_number
      }`,
      airline: outbound.airline || outbound.airline_name,
      tripType: "ROUND_TRIP",
      outboundFlight: this.formatFlightCard(outbound),
      returnFlight: this.formatFlightCard(returnFlight),
      totalPrice: this.formatPrice(
        parseFloat(outbound.price || outbound.base_price || 0) +
          parseFloat(returnFlight.price || returnFlight.base_price || 0)
      ),
      totalDuration: this.calculateTotalDuration(outbound, returnFlight),
    };
  }

  /**
   * Format multi-city flight card
   * @param {Object} flight - Multi-city flight data
   * @returns {Object} Formatted multi-city card
   */
  formatMultiCityCard(flight) {
    return {
      flightId: flight.flightId || flight.flight_id,
      flightNumber: flight.flightNumber || flight.flight_number,
      airline: flight.airline || flight.airline_name,
      tripType: "MULTI_CITY",
      routes: flight.routes || [],
      totalStops: flight.totalStops || 0,
      totalPrice: this.formatPrice(flight.price || flight.base_price),
      totalDuration: flight.totalDuration || "N/A",
    };
  }

  /**
   * Group round-trip flights by their group ID
   * @param {Array} flights - Array of flights
   * @returns {Array} Grouped round-trip flights
   */
  groupRoundTripFlights(flights) {
    const groups = {};

    flights.forEach((flight) => {
      const groupId = flight.roundTripGroupId || flight.round_trip_group_id;
      if (groupId) {
        if (!groups[groupId]) {
          groups[groupId] = { outbound: null, return: null };
        }

        // Determine if this is outbound or return flight
        // This is a simplified logic - you might need more sophisticated detection
        if (!groups[groupId].outbound) {
          groups[groupId].outbound = flight;
        } else {
          groups[groupId].return = flight;
        }
      }
    });

    return Object.values(groups).filter(
      (group) => group.outbound && group.return
    );
  }

  /**
   * Build additional information
   * @param {Object} context - Query context
   * @returns {Object} Additional information
   */
  buildAdditionalInfo(context) {
    return {
      bookingTips: [
        "Giá vé có thể thay đổi, hãy đặt vé sớm để có giá tốt nhất",
        "Có thể áp dụng các chương trình khuyến mãi đặc biệt",
        "Kiểm tra yêu cầu visa và hộ chiếu trước khi đặt vé",
      ],
      contactInfo: {
        phone: "1900 XXX XXX",
        email: "support@airsky.com",
        website: "www.airsky.com",
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Build suggestions based on search results
   * @param {Array} flights - Array of flights
   * @param {Object} context - Query context
   * @returns {Array} Suggestions
   */
  buildSuggestions(flights, context) {
    const suggestions = [];

    if (flights.length > 0) {
      // Price-based suggestions
      const cheapest = flights.reduce((min, flight) =>
        parseFloat(flight.price || flight.base_price || 0) <
        parseFloat(min.price || min.base_price || 0)
          ? flight
          : min
      );

      if (cheapest) {
        suggestions.push({
          type: "price",
          message: `Chuyến bay tiết kiệm nhất: ${
            cheapest.flightNumber || cheapest.flight_number
          } với giá ${this.formatPrice(cheapest.price || cheapest.base_price)}`,
        });
      }

      // Time-based suggestions
      const earliest = flights.reduce((min, flight) => {
        const minTime = new Date(min.departureTime || min.departure_time);
        const currentTime = new Date(
          flight.departureTime || flight.departure_time
        );
        return currentTime < minTime ? flight : min;
      });

      if (earliest) {
        suggestions.push({
          type: "time",
          message: `Chuyến bay khởi hành sớm nhất: ${
            earliest.flightNumber || earliest.flight_number
          } lúc ${this.formatTime(
            earliest.departureTime || earliest.departure_time
          )}`,
        });
      }
    }

    return suggestions;
  }

  /**
   * Build alternative suggestions when no results found
   * @param {Object} context - Query context
   * @returns {Array} Alternative suggestions
   */
  buildAlternativeSuggestions(context) {
    const { departureCity, arrivalCity, date } = context;

    return [
      {
        type: "date",
        message: `Thử tìm chuyến bay vào ngày khác gần ${this.formatDate(
          date
        )}`,
      },
      {
        type: "route",
        message: `Xem xét các tuyến bay kết nối qua các sân bay trung chuyển`,
      },
      {
        type: "flexibility",
        message: `Tăng tính linh hoạt với ngày khởi hành hoặc điểm đến`,
      },
    ];
  }

  /**
   * Build search tips
   * @returns {Array} Search tips
   */
  buildSearchTips() {
    return [
      "Hãy thử tìm kiếm với tên thành phố thay vì mã sân bay",
      "Xem xét các chuyến bay có điểm dừng để có giá tốt hơn",
      "Đặt vé vào các ngày trong tuần thường có giá rẻ hơn",
      "Theo dõi khuyến mãi và đặt vé sớm để có ưu đãi tốt nhất",
    ];
  }

  /**
   * Utility methods
   */
  formatTime(timeString) {
    if (!timeString) return "N/A";
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return timeString;
    }
  }

  formatDate(dateString) {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  }

  formatPrice(price) {
    if (!price) return "Liên hệ";
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return price;
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(numPrice);
  }

  calculateDuration(departureTime, arrivalTime) {
    if (!departureTime || !arrivalTime) return "N/A";

    try {
      const dep = new Date(departureTime);
      const arr = new Date(arrivalTime);
      const diffMs = arr - dep;
      const diffMins = Math.floor(diffMs / 60000);

      const hours = Math.floor(diffMins / 60);
      const minutes = diffMins % 60;

      return `${hours}h ${minutes}m`;
    } catch {
      return "N/A";
    }
  }

  calculateTotalDuration(outbound, returnFlight) {
    // This is a simplified calculation
    // In reality, you'd need to consider the time between outbound arrival and return departure
    const outboundDuration = this.calculateDuration(
      outbound.departureTime || outbound.departure_time,
      outbound.arrivalTime || outbound.arrival_time
    );

    const returnDuration = this.calculateDuration(
      returnFlight.departureTime || returnFlight.departure_time,
      returnFlight.arrivalTime || returnFlight.arrival_time
    );

    return `${outboundDuration} + ${returnDuration}`;
  }

  /**
   * Error template builders
   */
  buildErrorTemplate(error) {
    return {
      type: "error",
      message:
        "Xin lỗi, có lỗi xảy ra khi tìm kiếm chuyến bay. Vui lòng thử lại sau.",
      error: error.message,
      suggestions: [
        "Kiểm tra lại thông tin tìm kiếm",
        "Thử tìm kiếm với từ khóa khác",
        "Liên hệ bộ phận hỗ trợ nếu vấn đề vẫn tiếp tục",
      ],
    };
  }

  buildApiErrorTemplate(error) {
    return {
      type: "api_error",
      message: "Không thể kết nối đến dịch vụ tìm kiếm. Vui lòng thử lại sau.",
      error: error.message,
      retryAfter: 30000, // 30 seconds
    };
  }
}

/**
 * Singleton instance
 */
let responseTemplateInstance = null;

/**
 * Get response template instance
 * @returns {FlightResponseTemplate} Template instance
 */
function getFlightResponseTemplate() {
  if (!responseTemplateInstance) {
    responseTemplateInstance = new FlightResponseTemplate();
  }
  return responseTemplateInstance;
}

module.exports = {
  FlightResponseTemplate,
  getFlightResponseTemplate,
};
