import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("Warning: GEMINI_API_KEY is not defined in environment variables. Ensure it's configured in AI Studio.");
}

const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Endpoint to enrich a single company + founder row with aggressive OSINT Research
  app.post("/api/enrich-row", async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { rowContext } = req.body;
      if (!rowContext || typeof rowContext !== "object" || Object.keys(rowContext).length === 0) {
        res.status(400).json({ error: "Context data (rowContext) is required" });
        return;
      }

      // Find a reasonable company name to log, defaulting to first key if not obvious
      const keys = Object.keys(rowContext);
      const companyKey = keys.find(k => {
        const l = k.toLowerCase();
        return l.includes("company") || l.includes("organization") || l.includes("firm") || l === "name";
      }) || keys[0];
      const targetCompany = rowContext[companyKey] || "Unknown Company";

      console.log(`[OSINT Research API] Initiating deep web research for: "${targetCompany}"`);
      console.log(`[OSINT Research API] Rich context provided:`, JSON.stringify(rowContext));

      const systemPrompt = `You are an elite B2B data researcher. I am providing you with rich contextual data about a company and its founder. You MUST use live Google Search to investigate and fill in the missing firmographics.
Conduct deep web research to find:
1. The official Company Domain.
2. The official Company LinkedIn URL.
3. Traffic Analytics (Search for public Similarweb, Semrush, or PR mentions to estimate Total Visits, Avg Bounce Rate, and Pages Per Visit).
4. Work Email (Search for public contact emails, press release emails, or standard email format patterns for this specific founder/company).

Output STRICTLY as a JSON object with these exact keys: 'domain', 'company_linkedin', 'traffic_analytics', 'work_email'. If a piece of data is completely invisible on the web after deep searching, output 'Not Found', but exhaust all search options first.`;

      const userPrompt = `Here is the rich contextual data for the target:
${JSON.stringify(rowContext, null, 2)}

Please perform live research using Google Search tool to extract the missing information as specified in the system prompt.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
        ],
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              domain: { type: Type.STRING, description: "Official company domain name, e.g. stripe.com or linear.app. 'Not Found' if not resolved." },
              company_linkedin: { type: Type.STRING, description: "Official corporate LinkedIn directory URL. 'Not Found' if not resolved." },
              traffic_analytics: { type: Type.STRING, description: "Estimated total monthly visits, avg bounce rate, and pages per visit, e.g. '1.2M visits, 45% bounce, 3.4 pages/visit'. 'Not Found' if not resolved." },
              work_email: { type: Type.STRING, description: "Specific found email address or standard email pattern, e.g. 'john@stripe.com'. 'Not Found' if not resolved." }
            },
            required: ["domain", "company_linkedin", "traffic_analytics", "work_email"]
          }
        }
      });

      let result = {
        domain: "Not Found",
        company_linkedin: "Not Found",
        traffic_analytics: "Not Found",
        work_email: "Not Found"
      };

      if (response.text) {
        try {
          result = JSON.parse(response.text.trim());
        } catch (e) {
          console.error("[OSINT API] Failed to parse JSON response:", response.text, e);
        }
      }

      // Normalize domain if returned as full URL
      if (result.domain && result.domain !== "Not Found") {
        result.domain = result.domain
          .replace(/^(https?:\/\/)?(www\.)?/, "")
          .split("/")[0]
          .trim();
      }

      // Extract search grounding sources
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks
        ? chunks
            .map((chunk: any) => ({
              title: chunk.web?.title || "Google Search Source",
              uri: chunk.web?.uri || "",
            }))
            .filter((s: any) => s.uri !== "")
        : [];

      // De-duplicate sources
      const uniqueSources = Array.from(new Map(sources.map((s: any) => [s.uri, s])).values());

      res.json({
        ...result,
        sources: uniqueSources,
      });
    } catch (error: any) {
      console.error("[OSINT Research API] Error:", error);
      res.status(500).json({ error: error.message || "OSINT enrichment failed due to internal error" });
    }
  });

  // Serve static assets or mount Vite dev server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
