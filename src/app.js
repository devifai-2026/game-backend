import express from "express";
import cors from "cors";

const app = express();

// CORS setup
const allowedOrigins = [
  "http://localhost:3000", // local dev (user)
  "http://localhost:5174", // local dev (admin)
  "https://gameadmin-v.netlify.app", // admin dashboard
  "https://devifai.website", // production domain
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsers with increased limits for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

// Other routes
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

export default app;
