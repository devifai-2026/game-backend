import express from "express";
import cors from "cors";

const app = express();

app.use(cors("*"));

// Normal body parsers (used for all other routes)
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
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
