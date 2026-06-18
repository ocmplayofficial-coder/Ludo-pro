import dotenv from 'dotenv';

dotenv.config();

console.log("=================================");
console.log("MONGO_URI =", process.env.MONGO_URI);
console.log("NODE_ENV =", process.env.NODE_ENV);
console.log("=================================");

export const env = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  JWT_SECRET:
    process.env.JWT_SECRET ||
    'ludo-pro-arena-secret-key-2026',

  MONGO_URI: process.env.MONGO_URI || '',

  REDIS_URL:
    process.env.REDIS_URL ||
    'redis://localhost:6379',

  // Admin
  ADMIN_EMAIL:
    process.env.ADMIN_EMAIL ||
    'admin@example.com',

  ADMIN_PASSWORD:
    process.env.ADMIN_PASSWORD ||
    'admin123',

  ADMIN_UPI_ID:
    process.env.ADMIN_UPI_ID || '',

  ADMIN_QR_URL:
    process.env.ADMIN_QR_URL || '',

  // SMS
  APITXT_API_KEY:
    process.env.APITXT_API_KEY || '',

  APITXT_SENDER_ID:
    process.env.APITXT_SENDER_ID || '',

  APITXT_TEMPLATE_ID:
    process.env.APITXT_TEMPLATE_ID || ''
};