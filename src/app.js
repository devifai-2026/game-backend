import express from "express";
import cors from "cors";

const app = express();

// CORS setup - Allow your Netlify frontend
const allowedOrigins = [
  "http://localhost:3000",           // local dev (user)
  "http://localhost:5174",           // local dev (admin)
  "http://localhost:5173",           // common Vite port
  "https://gameadmin-v.netlify.app", // your Netlify frontend
  "https://devifai.website",         // your API domain itself (if needed)
  "https://www.devifai.website",     // www version if applicable
];

// Comprehensive CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        console.log('CORS blocked origin:', origin); // For debugging
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,                    // Allow cookies/auth headers
    optionsSuccessStatus: 200,             // For legacy browsers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
  })
);

// Handle preflight requests explicitly
app.options('*', cors());

// Increase file upload limits significantly for animations/videos
app.use(express.json({ limit: "100mb" }));           // Increased from 16kb to 100mb
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.static("public"));

// Specific middleware for animation routes with even larger limit
app.use("/api/v1/animations", express.json({ limit: "200mb" }));

// Request logging middleware (optional but helpful for debugging)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Origin:', req.headers.origin);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Content-Length:', req.headers['content-length']);
  next();
});

// Import routes
import adminRoutes from "./routes/admin/admin.routes.js";
import animationRoutes from "./routes/animations/animations.routes.js";
import godRoutes from "./routes/god/god.routes.js";
import godIdolRoutes from "./routes/godIdol/godIdol.routes.js";
import splashRoutes from "./routes/splash/splash.routes.js";
import userRoutes from "./routes/user/user.routes.js";

// Use routes
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/animations", animationRoutes);
app.use("/api/v1/gods", godRoutes);
app.use("/api/v1/god-idol", godIdolRoutes);
app.use("/api/v1/splash", splashRoutes);

// Home route
app.get("/", (req, res) => {
  res.send("Welcome To Game API!");
});

// Health check endpoint (useful for monitoring)
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// CORS test endpoint
app.get("/cors-test", (req, res) => {
  res.json({
    message: "CORS is working!",
    yourOrigin: req.headers.origin || "No origin",
    allowedOrigins: allowedOrigins,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware for CORS errors
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  
  // Handle CORS errors
  if (err.message.includes('CORS') || err.message.includes('origin')) {
    return res.status(403).json({
      success: false,
      error: "CORS Error",
      message: err.message,
      hint: "Please check if your origin is allowed"
    });
  }
  
  // Handle file too large error
  if (err.type === 'entity.too.large' || err.message.includes('too large')) {
    return res.status(413).json({
      success: false,
      error: "File Too Large",
      message: "Uploaded file exceeds the size limit. Maximum size is 100MB.",
      limit: "100MB"
    });
  }
  
  // Handle other errors
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler for undefined routes
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: [
      "/",
      "/health",
      "/cors-test",
      "/api/v1/admin",
      "/api/v1/users",
      "/api/v1/animations",
      "/api/v1/gods",
      "/api/v1/god-idol",
      "/api/v1/splash"
    ]
  });
});

export default app;