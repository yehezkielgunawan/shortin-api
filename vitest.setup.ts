// Vitest global setup (node environment)
import dotenv from "dotenv";

dotenv.config();

// Ensure test environment
process.env.NODE_ENV = process.env.NODE_ENV || "test";
