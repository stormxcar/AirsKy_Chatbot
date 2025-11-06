// utils/langchainSQL.js
const { ChatMistralAI } = require("@langchain/mistralai");
const mysql = require("mysql2/promise");
const logger = require("./logger");
const { getFlightResponseTemplate } = require("./responseTemplate");

/**
 * LangChain-powered SQL Database Manager
 * Provides automated SQL query generation, validation, and execution
 */
class LangChainSQLManager {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.llm = null;
    this.isInitialized = false;
    this.responseTemplate = getFlightResponseTemplate();
  }

  /**
   * Initialize LangChain SQL components
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Test the existing connection pool
      const connection = await this.dbPool.getConnection();
      logger.info("✅ Connected to MySQL database for LangChain");
      connection.release();

      // Initialize Mistral AI LLM
      this.llm = new ChatMistralAI({
        modelName: "mistral-medium",
        temperature: 0,
        apiKey: process.env.MISTRAL_API_KEY,
      });

      this.isInitialized = true;
      logger.info("✅ LangChain SQL Manager initialized successfully");
    } catch (error) {
      logger.error("❌ Failed to initialize LangChain SQL Manager:", error);
      throw error;
    }
  }

  /**
   * Generate and execute SQL query from natural language
   * @param {string} naturalLanguageQuery - Natural language query
   * @param {Object} context - Additional context for query generation
   * @returns {Promise<Object>} Query results with metadata
   */
  async executeNaturalLanguageQuery(naturalLanguageQuery, context = {}) {
    if (!this.isInitialized) {
      throw new Error("LangChain SQL Manager not initialized");
    }

    const startTime = Date.now();

    try {
      logger.info(
        `🔍 Processing natural language query: ${naturalLanguageQuery}`
      );

      // Create a simple prompt for SQL generation
      const prompt = `You are a SQL expert. Convert this natural language query to a MySQL SELECT statement.

Database schema with JOIN relationships:

**flights table:**
- flight_id (PRIMARY KEY)
- flight_number
- departure_time, arrival_time
- base_price
- trip_type ('ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY')
- round_trip_group_id
- airline_id (FOREIGN KEY → airlines.airline_id)
- departure_airport_id (FOREIGN KEY → airports.airport_id)
- arrival_airport_id (FOREIGN KEY → airports.airport_id)

**airlines table:**
- airline_id (PRIMARY KEY)
- airline_name
- airline_code

**airports table:**
- airport_id (PRIMARY KEY)
- airport_name
- airport_code
- city_name

**stops table:**
- stop_id (PRIMARY KEY)
- flight_id (FOREIGN KEY → flights.flight_id)
- airport_id (FOREIGN KEY → airports.airport_id)
- stop_order (INT) - thứ tự điểm dừng
- arrival_time - thời gian đến điểm dừng
- departure_time - thời gian khởi hành từ điểm dừng
- stop_duration - thời gian dừng (phút)

CRITICAL: You MUST ALWAYS select these fields in your SELECT statement:
- flights.flight_id
- flights.flight_number
- flights.departure_time
- flights.arrival_time
- flights.base_price
- flights.trip_type
- flights.round_trip_group_id
- airlines.airline_name
- airlines.airline_code
- da.airport_name AS departure_airport_name
- da.airport_code AS departure_airport_code
- da.city_name AS departure_city
- aa.airport_name AS arrival_airport_name
- aa.airport_code AS arrival_airport_code
- aa.city_name AS arrival_city

IMPORTANT: You MUST use JOINs to get related data. For example:
- To get airline_name: JOIN airlines ON flights.airline_id = airlines.airline_id
- To get departure airport info: JOIN airports da ON flights.departure_airport_id = da.airport_id
- To get arrival airport info: JOIN airports aa ON flights.arrival_airport_id = aa.airport_id
- For ROUND-TRIP: Use additional JOINs for return flight with aliases da2, aa2, al2
- Always select city_name fields: da.city_name, aa.city_name, da2.city_name, aa2.city_name

For city name matching, use LIKE with wildcards to handle variations:
- Hanoi → city_name LIKE '%Hanoi%' OR city_name LIKE '%Hà Nội%'
- Ho Chi Minh City → city_name LIKE '%Ho Chi Minh%' OR city_name LIKE '%Sài gòn%' OR city_name LIKE '%Hồ Chí Minh%'
- Da Nang → city_name LIKE '%Da Nang%' OR city_name LIKE '%đà nẵng%'

FOR ROUND-TRIP SEARCHES:
- When user asks for round-trip flights, you need to find BOTH flights in the same round_trip_group_id
- The query should return both the outbound and return flights
- Use WHERE round_trip_group_id IS NOT NULL to ensure we get paired flights
- For round-trip, you might need to search for flights where the departure and arrival are swapped for the return leg
- IMPORTANT: For round-trip queries, you MUST select city information for BOTH outbound and return flights:
  - outbound_departure_city: da.city_name
  - outbound_arrival_city: aa.city_name
  - return_departure_city: da2.city_name (for return flight)
  - return_arrival_city: aa2.city_name (for return flight)
- Use aliases like 'da' for outbound departure airport, 'aa' for outbound arrival airport, 'da2' for return departure airport, 'aa2' for return arrival airport

FOR MULTI-CITY SEARCHES:
- When user asks for multi-city, connecting flights, or flights with stops, ALWAYS use WHERE flights.trip_type = 'MULTI_CITY'
- Use LEFT JOIN with stops table to get intermediate stops
- Order stops by stop_order to maintain sequence
- For multi-city journeys, you might need multiple separate flight queries
- Example: "Hanoi to Tokyo via Seoul" should find flights with stops in Seoul
- Example: "Find flights from Hà Nội to Đà Nẵng for multi-city" → Use WHERE flights.trip_type = 'MULTI_CITY'
- IMPORTANT: If the query mentions "multi-city", "connecting", "with stops", "via", or similar terms, use MULTI_CITY trip type

FOR CONNECTING FLIGHTS:
- If user wants connecting flights, find separate flights that connect
- Example: "Hanoi to Tokyo with stop in Seoul" → Find flight Hanoi-Seoul + flight Seoul-Tokyo
- Use time logic to ensure connection times are reasonable (at least 1 hour)

Query: "${naturalLanguageQuery}"

Return ONLY the SQL SELECT statement with proper JOINs, no explanations:`;

      // Generate SQL using Mistral AI
      const response = await this.llm.invoke(prompt);
      let sqlQuery = response.content.trim();

      // Clean up the response (remove markdown formatting if present)
      sqlQuery = sqlQuery
        .replace(/```sql\s*/g, "")
        .replace(/```\s*$/g, "")
        .trim();

      logger.info(`📝 Generated SQL: ${sqlQuery}`);

      // Validate that all required fields are selected
      const fieldValidation = this.validateRequiredFields(sqlQuery);
      if (!fieldValidation.isValid) {
        logger.warn(
          `⚠️ SQL query missing required fields: ${fieldValidation.missingFields.join(
            ", "
          )}`
        );
        // Try to fix the query by adding missing fields
        sqlQuery = this.addMissingFields(
          sqlQuery,
          fieldValidation.missingFields
        );
        logger.info(`🔧 Fixed SQL query: ${sqlQuery}`);
      }

      // Validate generated query
      const validation = this.validateGeneratedQuery(sqlQuery);
      if (!validation.isValid) {
        throw new Error(
          `Generated query validation failed: ${validation.error}`
        );
      }

      // Execute the query using mysql2 pool
      const [rows] = await this.dbPool.execute(sqlQuery);

      const executionTime = Date.now() - startTime;
      logger.info(`✅ Query executed successfully in ${executionTime}ms`);

      return {
        success: true,
        sqlQuery,
        result: rows,
        executionTime,
        metadata: {
          naturalLanguageQuery,
          context,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(
        `❌ Query execution failed after ${executionTime}ms:`,
        error
      );

      return {
        success: false,
        error: error.message,
        executionTime,
        metadata: {
          naturalLanguageQuery,
          context,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Execute natural language query with professional response formatting
   * @param {string} naturalLanguageQuery - Natural language query
   * @param {Object} context - Additional context for query generation and response
   * @returns {Promise<Object>} Formatted response with flight data
   */
  async executeFlightSearchQuery(naturalLanguageQuery, context = {}) {
    if (!this.isInitialized) {
      throw new Error("LangChain SQL Manager not initialized");
    }

    const startTime = Date.now();

    try {
      logger.info(`🔍 Processing flight search query: ${naturalLanguageQuery}`);

      // Extract search criteria from natural language
      const searchCriteria = await this.extractSearchCriteria(
        naturalLanguageQuery,
        context
      );

      // Generate SQL query
      const sqlQuery = await this.generateFlightSQL(searchCriteria);

      // Execute query
      const [rows] = await this.dbPool.execute(sqlQuery);

      // Process and format results
      const flightData = {
        flights: rows,
        tripType: searchCriteria.tripType,
        searchCriteria: searchCriteria,
      };

      // Build professional response
      const response = this.responseTemplate.buildResponse(flightData, {
        ...searchCriteria,
        originalQuery: naturalLanguageQuery,
      });

      const executionTime = Date.now() - startTime;
      logger.info(`✅ Flight search completed in ${executionTime}ms`);

      return {
        success: true,
        response: response,
        metadata: {
          sqlQuery,
          executionTime,
          flightCount: rows.length,
          searchCriteria,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`❌ Flight search failed after ${executionTime}ms:`, error);

      return {
        success: false,
        response: this.responseTemplate.buildResponse(
          {},
          { originalQuery: naturalLanguageQuery }
        ),
        error: error.message,
        metadata: {
          executionTime,
          searchCriteria: context,
        },
      };
    }
  }

  /**
   * Validate that SQL query contains all required fields
   * @param {string} query - SQL query to validate
   * @returns {Object} Validation result with missing fields
   */
  validateRequiredFields(query) {
    const requiredFields = [
      "flight_id",
      "flight_number",
      "departure_time",
      "arrival_time",
      "base_price",
      "trip_type",
      "airline_name",
      "departure_airport_code",
      "arrival_airport_code",
      "departure_city",
      "arrival_city",
    ];

    const missingFields = [];
    const upperQuery = query.toUpperCase();

    for (const field of requiredFields) {
      // Check if field is selected (case-insensitive)
      if (!upperQuery.includes(field.toUpperCase())) {
        // Also check for aliases like "da.city_name AS departure_city"
        const aliasPattern = new RegExp(`AS\\s+${field}`, "i");
        if (!aliasPattern.test(query)) {
          missingFields.push(field);
        }
      }
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  }

  /**
   * Add missing fields to SQL query
   * @param {string} query - Original SQL query
   * @param {Array} missingFields - Fields to add
   * @returns {string} Fixed SQL query
   */
  addMissingFields(query, missingFields) {
    // Find the SELECT clause
    const selectMatch = query.match(/SELECT\s+(.*?)\s+FROM/i);
    if (!selectMatch) return query;

    let selectClause = selectMatch[1];

    // Add missing fields
    const fieldsToAdd = [];
    for (const field of missingFields) {
      switch (field) {
        case "flight_id":
          fieldsToAdd.push("flights.flight_id");
          break;
        case "flight_number":
          fieldsToAdd.push("flights.flight_number");
          break;
        case "departure_time":
          fieldsToAdd.push("flights.departure_time");
          break;
        case "arrival_time":
          fieldsToAdd.push("flights.arrival_time");
          break;
        case "base_price":
          fieldsToAdd.push("flights.base_price");
          break;
        case "trip_type":
          fieldsToAdd.push("flights.trip_type");
          break;
        case "airline_name":
          if (!query.includes("airlines.airline_name")) {
            fieldsToAdd.push("airlines.airline_name");
          }
          break;
        case "departure_airport_code":
          if (!query.includes("da.airport_code")) {
            fieldsToAdd.push("da.airport_code AS departure_airport_code");
          }
          break;
        case "arrival_airport_code":
          if (!query.includes("aa.airport_code")) {
            fieldsToAdd.push("aa.airport_code AS arrival_airport_code");
          }
          break;
        case "departure_city":
          if (!query.includes("da.city_name")) {
            fieldsToAdd.push("da.city_name AS departure_city");
          }
          break;
        case "arrival_city":
          if (!query.includes("aa.city_name")) {
            fieldsToAdd.push("aa.city_name AS arrival_city");
          }
          break;
      }
    }

    if (fieldsToAdd.length > 0) {
      selectClause += ", " + fieldsToAdd.join(", ");
    }

    return query.replace(selectMatch[0], `SELECT ${selectClause} FROM`);
  }

  /**
   * Validate generated SQL query
   * @param {string} query - SQL query to validate
   * @returns {Object} Validation result
   */
  validateGeneratedQuery(query) {
    if (!query || typeof query !== "string") {
      return { isValid: false, error: "Query is empty or not a string" };
    }

    const trimmedQuery = query.trim().toUpperCase();

    // Must start with SELECT
    if (!trimmedQuery.startsWith("SELECT")) {
      return { isValid: false, error: "Query must start with SELECT" };
    }

    // Check for dangerous keywords (as whole words, not substrings)
    const dangerousKeywords = [
      "INSERT",
      "UPDATE",
      "DELETE",
      "DROP",
      "CREATE",
      "ALTER",
      "TRUNCATE",
    ];
    for (const keyword of dangerousKeywords) {
      // Use word boundaries to match whole words only
      const keywordRegex = new RegExp(`\\b${keyword}\\b`, "i");
      if (keywordRegex.test(query)) {
        return {
          isValid: false,
          error: `Query contains dangerous keyword: ${keyword}`,
        };
      }
    }

    // Check for SQL injection patterns
    const injectionPatterns = [
      /;\s*--/i,
      /\/\*.*\*\//i,
      /UNION\s+SELECT/i,
      /OR\s+1\s*=\s*1/i,
    ];
    for (const pattern of injectionPatterns) {
      if (pattern.test(query)) {
        return {
          isValid: false,
          error: "Query contains potential SQL injection pattern",
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Execute predefined SQL query
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query results
   */
  async executePredefinedQuery(query, params = []) {
    if (!this.isInitialized) {
      throw new Error("LangChain SQL Manager not initialized");
    }

    const startTime = Date.now();

    try {
      const validation = this.validateGeneratedQuery(query);
      if (!validation.isValid) {
        throw new Error(`Query validation failed: ${validation.error}`);
      }

      const [rows] = await this.dbPool.execute(query, params);
      const executionTime = Date.now() - startTime;

      logger.info(
        `✅ Predefined query executed successfully in ${executionTime}ms`
      );

      return {
        success: true,
        result: rows,
        executionTime,
        metadata: {
          query,
          paramCount: params.length,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(
        `❌ Predefined query execution failed after ${executionTime}ms:`,
        error
      );

      return {
        success: false,
        error: error.message,
        executionTime,
        metadata: {
          query,
          paramCount: params.length,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Extract search criteria from natural language query
   * @param {string} query - Natural language query
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Extracted search criteria
   */
  async extractSearchCriteria(query, context = {}) {
    const extractionPrompt = `Extract flight search criteria from this query: "${query}"

Return a JSON object with these fields:
- departureCity: departure city name
- arrivalCity: arrival city name
- date: departure date (YYYY-MM-DD format)
- returnDate: return date for round-trip (YYYY-MM-DD format)
- passengers: number of passengers (default 1)
- tripType: "ONE_WAY", "ROUND_TRIP", or "MULTI_CITY"
- class: "ECONOMY", "BUSINESS", "FIRST" (default "ECONOMY")

For dates, convert relative dates:
- "tomorrow" → tomorrow's date from ${new Date().toISOString().split("T")[0]}
- "next week" → 7 days from ${new Date().toISOString().split("T")[0]}
- "next month" → 30 days from ${new Date().toISOString().split("T")[0]}
- "this weekend" → next Saturday from ${new Date().toISOString().split("T")[0]}

Return only valid JSON, no explanations.`;

    try {
      const response = await this.llm.invoke(extractionPrompt);
      const criteria = JSON.parse(response.content.trim());

      // Validate and set defaults
      return {
        departureCity: criteria.departureCity || null,
        arrivalCity: criteria.arrivalCity || null,
        date: criteria.date || null,
        returnDate: criteria.returnDate || null,
        passengers: criteria.passengers || 1,
        tripType: criteria.tripType || "ONE_WAY",
        class: criteria.class || "ECONOMY",
        ...context,
      };
    } catch (error) {
      logger.warn("Failed to extract search criteria, using defaults:", error);
      return {
        departureCity: null,
        arrivalCity: null,
        date: null,
        returnDate: null,
        passengers: 1,
        tripType: "ONE_WAY",
        class: "ECONOMY",
        ...context,
      };
    }
  }

  /**
   * Generate SQL query based on search criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<string>} SQL query
   */
  async generateFlightSQL(criteria) {
    const { departureCity, arrivalCity, date, returnDate, tripType } = criteria;

    let sqlQuery = `
      SELECT
        flights.flight_id,
        flights.flight_number,
        flights.departure_time,
        flights.arrival_time,
        flights.base_price,
        flights.trip_type,
        flights.round_trip_group_id,
        airlines.airline_name,
        airlines.airline_code,
        da.airport_name AS departure_airport_name,
        da.airport_code AS departure_airport_code,
        da.city_name AS departure_city,
        aa.airport_name AS arrival_airport_name,
        aa.airport_code AS arrival_airport_code,
        aa.city_name AS arrival_city
      FROM flights
      JOIN airlines ON flights.airline_id = airlines.airline_id
      JOIN airports da ON flights.departure_airport_id = da.airport_id
      JOIN airports aa ON flights.arrival_airport_id = aa.airport_id
      WHERE 1=1
    `;

    // Add conditions based on criteria
    if (departureCity) {
      sqlQuery += ` AND (da.city_name LIKE '%${departureCity}%' OR da.airport_name LIKE '%${departureCity}%')`;
    }

    if (arrivalCity) {
      sqlQuery += ` AND (aa.city_name LIKE '%${arrivalCity}%' OR aa.airport_name LIKE '%${arrivalCity}%')`;
    }

    if (date) {
      sqlQuery += ` AND DATE(flights.departure_time) = '${date}'`;
    }

    if (tripType) {
      sqlQuery += ` AND flights.trip_type = '${tripType}'`;
    }

    // For round-trip, ensure we get paired flights
    if (tripType === "ROUND_TRIP") {
      sqlQuery += ` AND flights.round_trip_group_id IS NOT NULL`;
    }

    sqlQuery += ` ORDER BY flights.base_price ASC, flights.departure_time ASC LIMIT 20`;

    return sqlQuery;
  }

  /**
   * Test database connectivity
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      await this.dbPool.execute("SELECT 1");
      logger.info("✅ Database connection test successful");
      return true;
    } catch (error) {
      logger.error("❌ Database connection test failed:", error);
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let langChainSQLInstance = null;

/**
 * Get or create LangChain SQL Manager instance
 * @param {Object} dbPool - Database connection pool
 * @returns {LangChainSQLManager} SQL Manager instance
 */
function getLangChainSQLManager(dbPool) {
  if (!langChainSQLInstance) {
    langChainSQLInstance = new LangChainSQLManager(dbPool);
  }
  return langChainSQLInstance;
}

/**
 * Initialize LangChain SQL Manager
 * @param {Object} dbPool - Database connection pool
 * @returns {Promise<LangChainSQLManager>} Initialized SQL Manager
 */
async function initializeLangChainSQL(dbPool) {
  const manager = getLangChainSQLManager(dbPool);
  await manager.initialize();
  return manager;
}

module.exports = {
  LangChainSQLManager,
  getLangChainSQLManager,
  initializeLangChainSQL,
};
