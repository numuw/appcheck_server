import "./src/config/dotenv.js";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import routes from "./src/routes/index.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";
import { appCheckMiddleware } from "./src/middlewares/appCheckMiddleware.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/server", appCheckMiddleware, routes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Not Found" }));

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
