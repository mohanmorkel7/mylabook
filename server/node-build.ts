import path from "path";
import express from "express";
import finopsScheduler from "./services/finopsScheduler"; // Assuming this handles your scheduler logic
import { fileURLToPath } from "url";
import { createServer } from "./index"; // Assuming createServer is in the same folder

// Create the server instance
const app = createServer();
const port = process.env.PORT || 5000;

// Mimic __dirname in ES modules
const __filename = fileURLToPath(import.meta.url); // Get the current file URL
const __dirname = path.dirname(__filename); // Get the directory name of the current file

// Path to the frontend static files (SPA)
const distPath = path.join(__dirname, "../frontend");

// Serve static files (Frontend build)
app.use(express.static(distPath));

// Serve the SPA index.html for all non-API requests (handle client-side routing)
app.get("/{*splat}", (req, res) => {
  // If it's an API or health check request, return a 404
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  // Otherwise, serve the SPA index.html
  res.sendFile(path.join(distPath, "index.html"));
});

// Graceful shutdown handling
const gracefulShutdown = () => {
  console.log("🛑 Shutting down gracefully...");
  finopsScheduler.stop();  // Assuming this stops any ongoing tasks
  process.exit(0);
};

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);

  // Initialize FinOps scheduler for automated task execution and SLA monitoring
  try {
    finopsScheduler.initialize();
    console.log(`⏰ FinOps Scheduler initialized successfully`);
  } catch (error) {
    console.error(`❌ Failed to initialize FinOps Scheduler:`, error);
  }
});

// Graceful shutdown handling
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
