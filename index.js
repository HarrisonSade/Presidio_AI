const express = require("express");
const app = express();

const fs = require('fs').promises;
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'primer-history.json');

async function loadHistory() {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet
    return [];
  }
}

async function saveHistory(history) {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
}

app.use(express.json());
app.use(express.static("public"));

// Get history endpoint
app.get("/api/history", async (req, res) => {
  const history = await loadHistory();
  res.json(history);
});

// Get single history item
app.get("/api/history/:id", async (req, res) => {
  const history = await loadHistory();
  const item = history.find(h => h.id === req.params.id);
  if (item) {
    res.json(item);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

// Generate primer endpoint
app.post("/api/generate", async (req, res) => {
  const { names, company, product } = req.body;

  // YOUR API KEY - Replace with your actual API key
  const apiKey = "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";

  // Your exact prompt - EDIT THIS TO CHANGE WHAT CLAUDE SAYS
  const prompt = `You are an elite investment researcher with web search capabilities. Your job is to find REAL, ACCURATE information and create comprehensive meeting intelligence. Do not include sources or citations at all, until a section at the very end.

Meeting: ${names} at ${company}
Pitching: ${product}

PHASE 1: SYSTEMATIC WEB RESEARCH

Start with these essential searches:
1. "${names}" "${company}" - find their exact role and connection
2. "${names}" LinkedIn profile - get their full background
3. "${company}" official website team page - verify their position
4. "${names}" "${company}" news announcements deals - find recent activity

Then dig deeper:
- Search for their investment portfolio and notable deals
- Look for interviews, podcasts, or speaking engagements
- Find their educational background and career progression
- Search for their investment thesis and focus areas
- Look for recent news about ${company} funds, AUM, strategy

CRITICAL BASICS TO FIND:
✓ Full name and exact current title
✓ How long they've been at ${company}
✓ Previous roles and companies
✓ Education (undergrad and graduate)
✓ Notable investments they've led or been involved in
✓ ${company}'s current fund size and vintage
✓ Recent deals ${company} has done
✓ Investment thesis and check sizes

PHASE 2: INTELLIGENT SYNTHESIS

Once you have the facts, use your reasoning to:
- Connect patterns in their investment history
- Understand what drives their investment decisions
- Identify how ${product} genuinely fits their strategy
- Spot non-obvious connections or angles
- Analyze their communication style from public statements

PHASE 3: COMPREHENSIVE OUTPUT

**INVESTOR PROFILE: ${names}**
[Start with the basics: exact title, tenure, education, previous roles. Then go deeper: investment philosophy, notable deals with specifics, what they look for in investments, their reputation in the market]

**FIRM INTELLIGENCE: ${company}**
[Current fund (size and vintage), AUM, recent investments with dates and amounts, team structure, LP base if known, competitive positioning, areas of focus]

**WHY THIS MATTERS: Strategic Fit**
[Based on actual portfolio and demonstrated preferences, explain precisely why ${product} aligns. Reference similar investments, market timing, fund deployment stage]

**MEETING STRATEGY**
[Specific tactics based on their background and style. Key metrics to emphasize. Questions they'll likely ask based on past investments. Red flags to avoid]

**POWER INSIGHTS**
[Non-obvious findings: shared connections, portfolio synergies, personal interests that align, recent challenges they might be facing that ${product} solves]

**KEY NUMBERS TO KNOW**
[Their typical check sizes, sweet spot for entry valuation, fund deployment timeline, recent exit multiples]

Remember: This is a REAL meeting. Use web search aggressively to find accurate, current information. Include citations where helpful. The goal is to walk in knowing more about them than any other founder would.
Start searching NOW and build from facts to insights.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-opus-4-20250514",  // Back to Opus 4 - it supports web search!
        max_tokens: 2500,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 15  // Allow plenty of searches for thorough research
        }],
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      res.status(400).json({ error: data.error.message });
    } else {
      // Extract the final text content from the response
      let finalContent = "";

      // Loop through all content blocks
      for (const content of data.content) {
        if (content.type === "text") {
          // Add text content
          finalContent += content.text;

          // Add citations if they exist
          if (content.citations && content.citations.length > 0) {
            finalContent += " [Sources: ";
            finalContent += content.citations.map(c => c.title).join(", ");
            finalContent += "]";
          }
        }
      }

      // Save to history
      const history = await loadHistory();
      const newEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        names,
        company,
        product,
        primer: finalContent
      };
      history.unshift(newEntry); // Add to beginning
      if (history.length > 50) history.pop(); // Keep only last 50
      await saveHistory(history);

      // Send response
      res.json({ primer: finalContent });
    }

  } catch (error) {
    res.status(500).json({ error: "Failed to generate primer: " + error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running with Claude Opus 4!");
});