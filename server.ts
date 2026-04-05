import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { initDb, getDb, saveDb } from "./db";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-for-oathnet-local";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Database
  await initDb();

  // Security Headers (CSP)
  app.use((req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " + // Vite needs unsafe-inline/eval in dev
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https://picsum.photos https://*.ransomware.live; " +
      "connect-src 'self';"
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  // Local Map Data Proxy (to keep everything "local" as requested)
  app.get("/api/map-data", async (req, res) => {
    try {
      const response = await axios.get("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json", {
        timeout: 10000
      });
      res.json(response.data);
    } catch (error) {
      console.error("Map data fetch error:", error);
      res.status(500).json({ error: "Failed to load map data" });
    }
  });

  // API Proxy for Ransomware.live
  app.get("/api/victims/recent", async (req, res) => {
    try {
      const apiKey = process.env.RANSOMWARE_API_KEY || "a72505f5-af2c-4b8b-95be-b28674f7ef72";
      
      const response = await axios.get("https://api-pro.ransomware.live/victims/recent", {
        params: {
          order: "discovered"
        },
        headers: {
          "X-API-KEY": apiKey,
          "Accept": "application/json"
        },
        timeout: 15000,
      });
      
      res.json(response.data);
    } catch (error: any) {
      console.error("Data feed error:", error.message);
      res.status(error.response?.status || 500).json({ 
        error: "Data feed temporarily unavailable" 
      });
    }
  });

  app.get("/api/group/:groupname", async (req, res) => {
    try {
      const apiKey = process.env.RANSOMWARE_API_KEY || "a72505f5-af2c-4b8b-95be-b28674f7ef72";
      const { groupname } = req.params;
      
      // Sanitize groupname to prevent potential SSRF or path traversal
      // Allow alphanumeric characters, hyphens, underscores, dots, and spaces
      if (!/^[a-zA-Z0-9-_\.\s]+$/.test(groupname)) {
        return res.status(400).json({ error: "Invalid group name format" });
      }
      
      const response = await axios.get(`https://api-pro.ransomware.live/group/${groupname}`, {
        headers: {
          "X-API-KEY": apiKey,
          "Accept": "application/json"
        },
        timeout: 10000,
      });
      
      res.json(response.data);
    } catch (error: any) {
      console.error(`Group info error (${req.params.groupname}):`, error.message);
      res.status(error.response?.status || 500).json({ 
        error: "Group data unavailable" 
      });
    }
  });

  app.get("/api/negotiations", async (req, res) => {
    try {
      const apiKey = process.env.RANSOMWARE_API_KEY || "a72505f5-af2c-4b8b-95be-b28674f7ef72";
      
      const response = await axios.get("https://api-pro.ransomware.live/negotiations", {
        headers: {
          "X-API-KEY": apiKey,
          "Accept": "application/json"
        },
        timeout: 10000,
      });
      
      res.json(response.data);
    } catch (error: any) {
      console.error("Negotiations feed error:", error.message);
      res.status(error.response?.status || 500).json({ 
        error: "Negotiations data unavailable" 
      });
    }
  });

  // Global Stats Proxy
  app.get("/api/stats", async (req, res) => {
    try {
      const apiKey = process.env.RANSOMWARE_API_KEY || "a72505f5-af2c-4b8b-95be-b28674f7ef72";
      const response = await axios.get("https://api-pro.ransomware.live/stats", {
        headers: {
          "X-API-KEY": apiKey,
          "Accept": "application/json"
        },
        timeout: 10000,
      });
      res.json(response.data);
    } catch (error: any) {
      console.error("Stats fetch error:", error.message);
      res.status(error.response?.status || 500).json({ error: "Stats unavailable" });
    }
  });

  // --- Auth Routes ---
  app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const dbData = await getDb();
      
      if (dbData.users.find(u => u.username === username)) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      dbData.lastId += 1;
      const newUser = {
        id: dbData.lastId,
        username,
        password: hashedPassword,
        created_at: new Date().toISOString()
      };
      
      dbData.users.push(newUser);
      await saveDb(dbData);
      
      const token = jwt.sign({ id: newUser.id, username }, JWT_SECRET, { expiresIn: "7d" });
      res.status(201).json({ token, user: { id: newUser.id, username } });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const dbData = await getDb();
      const user = dbData.users.find(u => u.username === username);
      
      if (!user || !user.password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, user: { id: user.id, username: user.username } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Server error" });
    }
  });
  // --- End Auth Routes ---

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
