import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(cors());

  // Gemini API Initialization Helper
  const getAI = (requestKey?: string) => {
    const apiKey = requestKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Please provide it in settings or environment.");
    }
    return new GoogleGenAI({ apiKey });
  };

  // Gemini Generation Endpoint
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const { model, contents, config, apiKey } = req.body;
      const genAI = getAI(apiKey);
      
      const response = await genAI.models.generateContent({
        model: model || "gemini-3-flash-preview",
        contents,
        config
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Proxy endpoint for WordPress to avoid CORS issues
  app.post("/api/wp-proxy", async (req, res) => {
    const { url, username, password, method, endpoint, data } = req.body;

    if (!url || !endpoint) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
      const auth = Buffer.from(`${username}:${password}`).toString("base64");
      const cleanUrl = url.replace(/\/$/, "").replace(/\/wp-json\/?$/, "");
      const authHeader = {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      };

      // Helper for resolving or creating categories/tags
      const resolveTerms = async (names: string[], type: 'categories' | 'tags') => {
        if (!names || names.length === 0) return [];
        const endpoint_type = type === 'categories' ? 'categories' : 'tags';
        const ids: number[] = [];

        for (const name of names) {
          try {
            // Try to find
            const searchRes = await axios.get(`${cleanUrl}/wp-json/wp/v2/${endpoint_type}?search=${encodeURIComponent(name)}`, { headers: authHeader });
            const existing = searchRes.data.find((t: any) => t.name.toLowerCase() === name.toLowerCase());
            
            if (existing) {
              ids.push(existing.id);
            } else {
              // Create new
              const createRes = await axios.post(`${cleanUrl}/wp-json/wp/v2/${endpoint_type}`, { name }, { headers: authHeader });
              ids.push(createRes.data.id);
            }
          } catch (e) {
            console.error(`Failed to resolve ${type} "${name}":`, e);
          }
        }
        return ids;
      };

      let finalData = { ...data };

      // Intercept post creation to resolve names
      if (endpoint === "/wp/v2/posts" && method === "POST") {
        if (data.category_names) {
          finalData.categories = await resolveTerms([data.category_names], 'categories');
          delete finalData.category_names;
        }
        if (data.tag_names) {
          finalData.tags = await resolveTerms(data.tag_names, 'tags');
          delete finalData.tag_names;
        }
      }

      console.log(`Proxying ${method} request to: ${cleanUrl}/wp-json${endpoint}`);

      const response = await axios({
        method: method || "POST",
        url: `${cleanUrl}/wp-json${endpoint}`,
        data: finalData,
        headers: authHeader,
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      const errorDetail = error.response?.data || error.message;
      console.error("WordPress Proxy Error:", errorDetail);
      res.status(error.response?.status || 500).json(errorDetail || { error: error.message });
    }
  });

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
    if (!process.env.GEMINI_API_KEY) {
      console.warn("WARNING: GEMINI_API_KEY is not set. AI generation will fail.");
    }
  });
}

startServer();
