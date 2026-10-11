import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_ENV_VARS = [
  'PORT',
  'MONGO_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_EXPIRY',
  'JWT_REFRESH_EXPIRY',
  'CLIENT_URL',
  'CLOUDINARY_CLOUD_NAME',   
  'CLOUDINARY_API_KEY',      
  'CLOUDINARY_API_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'OPENROUTER_API_KEY',
  'OPENROUTER_PRIMARY_MODEL',
  'OPENROUTER_FALLBACK_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'AI_DAILY_LIMIT',
];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = process.env[key];
    return value === undefined || value.trim() === '';
  });

  if (missing.length > 0) {
    console.error(
      `[ENV ERROR] Missing required environment variable(s): ${missing.join(', ')}\n` +
      `Check that your .env file exists in /server and defines all required keys.`
    );
    process.exit(1);
  }
}

validateEnv();

const config = Object.freeze({
  port: process.env.PORT,
  mongoUri: process.env.MONGO_URI,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL,
  jwt: Object.freeze({
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY,
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY,
  }),
  cloudinary: Object.freeze({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  }),
   smtp: Object.freeze({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  }),
    ai: Object.freeze({
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    openrouterPrimaryModel: process.env.OPENROUTER_PRIMARY_MODEL,
    openrouterFallbackModel: process.env.OPENROUTER_FALLBACK_MODEL,
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
    dailyLimit: Number(process.env.AI_DAILY_LIMIT),
  }),
  reminderTimezone: process.env.REMINDER_TIMEZONE || 'Asia/Kolkata',
  search: Object.freeze({
    tavilyApiKey: process.env.TAVILY_API_KEY || '', // optional: search stays off until set
    monthlyCreditCap: Number(process.env.SEARCH_MONTHLY_CREDIT_CAP) || 900,
    dailyLimitPerUser: Number(process.env.SEARCH_DAILY_LIMIT) || 15,
  }),
});

export default config ;