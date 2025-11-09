// server.js
import express from "express";
import path, { dirname, join } from "path";
import bodyParser from "body-parser";
import session from "express-session";
import fetch from "node-fetch";
import OAuth from "oauth-1.0a";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import WooCommerceRestApiPkg from "@woocommerce/woocommerce-rest-api";
import fs from "fs";

// ✅ WooCommerce API import
const WooCommerceRestApi = WooCommerceRestApiPkg.default || WooCommerceRestApiPkg;

// ✅ Setup dirname/filename (must be before using __dirname anywhere)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  // 1. Packaged app → Contents/Resources/.env
  const packagedEnv = path.join(process.resourcesPath || "", ".env");
  if (process.resourcesPath && fs.existsSync(packagedEnv)) {
    dotenv.config({ path: packagedEnv });
    console.log("✅ Loaded .env from packaged:", packagedEnv);

  } else {
    // 2. Check inside asar (next to server.js)
    const asarEnv = path.join(__dirname, ".env");
    if (fs.existsSync(asarEnv)) {
      dotenv.config({ path: asarEnv });
      console.log("✅ Loaded .env from asar bundle:", asarEnv);

    } else {
      // 3. Dev → project root
      const devEnv = path.join(process.cwd(), ".env");
      if (fs.existsSync(devEnv)) {
        dotenv.config({ path: devEnv });
        console.log("✅ Loaded .env from dev:", devEnv);
      } else {
        console.warn("⚠️ No .env found — GitHub features may not work");
      }
    }
  }

  // 🔎 Debug output to confirm important vars are available
  console.log("🔎 ENV DEBUG:", {
    GITHUB_OWNER: process.env.GITHUB_OWNER,
    GITHUB_REPO: process.env.GITHUB_REPO,
    HAS_GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
    HAS_NETSUITE_SANDBOX_URL: !!process.env.NETSUITE_SANDBOX_URL,
    HAS_NETSUITE_PROD_URL: !!process.env.NETSUITE_PROD_URL,
    HAS_WOOCOMMERCE_SANDBOX_URL: !!process.env.WOOCOMMERCE_URL_SANDBOX,
    HAS_WOOCOMMERCE_PROD_URL: !!process.env.WOOCOMMERCE_PROD_URL
  });
} catch (err) {
  console.error("❌ Failed to load .env:", err.message);
}




// ✅ Dynamic imports for local modules (safe in dev + packaged)
let users = [];
try {
  users = (await import("./users.js")).users;
  console.log("✅ Loaded users.js");
} catch (err) {
  console.error("❌ Failed to load users.js:", err.message);
}

let fieldMap = [];
try {
  fieldMap = (await import("./public/js/fieldMap.js")).fieldMap;
  console.log("✅ Loaded fieldMap.js");
} catch (err) {
  console.error("❌ Failed to load fieldMap.js:", err.message);
}

const app = express();
const PORT = process.env.PORT || 3000;



app.get("/fonts/:file", (req, res, next) => {
  console.log("🔎 Font requested:", req.params.file);
  next();
});


// ✅ Serve static files
const staticPath = path.join(__dirname, "public");
app.use(express.static(staticPath));
console.log("📂 Serving static files from:", staticPath);

// ✅ Serve static files safely for both Electron and Render
const staticBase =
  process.resourcesPath && fs.existsSync(process.resourcesPath)
    ? process.resourcesPath
    : __dirname;

const publicPath = path.join(staticBase, "public");
app.use("/public", express.static(publicPath));
console.log("📂 Serving static from:", publicPath);


/* -----------------------------
   NetSuite Environment Configs
------------------------------*/
const NETSUITE_SANDBOX = {
  account: process.env.NETSUITE_SANDBOX_ACCOUNT,
  accountDash: process.env.NETSUITE_SANDBOX_ACCOUNT_DASH,
  consumerKey: process.env.NETSUITE_SANDBOX_KEY,
  consumerSecret: process.env.NETSUITE_SANDBOX_SECRET,
  restUrl: process.env.NETSUITE_SANDBOX_URL,
};

const NETSUITE_PROD = {
  account: process.env.NETSUITE_PROD_ACCOUNT,
  accountDash: process.env.NETSUITE_PROD_ACCOUNT_DASH,
  consumerKey: process.env.NETSUITE_PROD_KEY,
  consumerSecret: process.env.NETSUITE_PROD_SECRET,
  restUrl: process.env.NETSUITE_PROD_URL,
};

// Helper to map string -> config
function getEnvConfigFromName(name) {
  return (String(name || "").toLowerCase() === "production") ? NETSUITE_PROD : NETSUITE_SANDBOX;
}

// Prefer session.environment; default to Sandbox
function getEnvConfig(req) {
  return getEnvConfigFromName(req?.session?.environment);
}

/* -----------------------------
   WooCommerce Environment Configs
------------------------------*/
const WOO_SANDBOX = {
  url: process.env.WOOCOMMERCE_URL_SANDBOX,
  key: process.env.WOOCOMMERCE_SANDBOX_KEY,
  secret: process.env.WOOCOMMERCE_SANDBOX_SECRET,
};

const WOO_PROD = {
  url: process.env.WOOCOMMERCE_PROD_URL,
  key: process.env.WOOCOMMERCE_PROD_KEY,
  secret: process.env.WOOCOMMERCE_PROD_SECRET,
};

// Helper to map string -> WooCommerce config
function getWooConfigFromName(name) {
  return (String(name || "").toLowerCase() === "production") ? WOO_PROD : WOO_SANDBOX;
}

function getWooApi(envName) {
  const cfg = getWooConfigFromName(envName);
  return new WooCommerceRestApi({
    url: cfg.url,
    consumerKey: cfg.key,
    consumerSecret: cfg.secret,
    version: "wc/v3",
  });
}


/* -----------------------------
   OAuth helpers (per environment)
------------------------------*/
function buildOAuth(consumerKey, consumerSecret) {
  return OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA256",
    hash_function(base_string, key) {
      return crypto.createHmac("sha256", key).update(base_string).digest("base64");
    },
  });
}

function getAuthHeader(url, method, tokenId, tokenSecret, envCfg) {
  const oauth = buildOAuth(envCfg.consumerKey, envCfg.consumerSecret);
  const request_data = { url, method };
  const token = { key: tokenId, secret: tokenSecret };
  const oauthData = oauth.authorize(request_data, token);

  const oauthHeader = oauth.toHeader(oauthData);
  oauthHeader.Authorization += `, realm="${envCfg.account}"`;

  return oauthHeader;
}

/* -----------------------------
   Middleware
------------------------------*/
app.use(express.static(join(__dirname, "public")));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 60 * 1000 },
  })
);


function authMiddleware(req, res, next) {
  if (req.session.user) return next();

  // If it's an API call, return JSON instead of redirecting
  if (req.originalUrl.startsWith("/api/") || req.originalUrl.startsWith("/push-")) {
    return res.status(401).json({ success: false, message: "Unauthorized - please log in" });
  }

  // Otherwise redirect to login
  return res.redirect("/");
}


/*

OLD AUTH MIDDLEARE FUNCTION

function authMiddleware(req, res, next) {
  if (req.session.user) next();
  else res.redirect("/");
} 

*/

/* -----------------------------
   Auth
------------------------------*/

app.post("/login", (req, res) => {
  const { username, password, environment } = req.body;
  const user = users.find((u) => u.username === username && u.password === password);

  if (user) {
    let tokenId, tokenSecret;

    if ((environment || "").toLowerCase() === "production") {
      tokenId = user.prod_tokenId;
      tokenSecret = user.prod_tokenSecret;
    } else {
      tokenId = user.sandbox_tokenId;
      tokenSecret = user.sandbox_tokenSecret;
    }

    req.session.user = {
      username: user.username,
      tokenId,
      tokenSecret
    };
    req.session.environment = environment || "Sandbox";

    res.json({ success: true });
  } else {
    // ❌ bad login → clear session completely
    req.session.user = null;
    req.session.environment = null;

    res.json({ success: false, message: "Invalid username or password!" });
  }
});

app.get("/env-check", (req, res) => {
  res.json({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    hasToken: !!process.env.GITHUB_TOKEN,
    tokenPreview: process.env.GITHUB_TOKEN
      ? process.env.GITHUB_TOKEN.slice(0, 6) + "...(hidden)"
      : "MISSING"
  });
});




// return username + environment
app.get("/get-user", (req, res) => {
  if (req.session.user) {
    res.json({
      ...req.session.user,
      environment: req.session.environment || "Sandbox"
    });
  } else {
    res.json({ username: null });
  }
});


/*-----------------------------
/ Get logs for UI
/-----------------------------*/

// server.js
const logs = [];
const MAX_LOGS = 50; // keep the last 50 lines

// Monkey-patch console.log and console.error
["log", "error", "warn"].forEach((method) => {
  const original = console[method];
  console[method] = (...args) => {
    const message = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    const entry = `[${new Date().toISOString()}] [${method.toUpperCase()}] ${message}`;
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.shift(); // keep buffer small
    original.apply(console, args);
  };
});

// Serve logs endpoint
app.get("/logs", (req, res) => {
  res.type("text/plain").send(logs.join("\n"));
});


/* -----------------------------
   Support: GitHub Issues
------------------------------*/

// Utility: normalize usernames for labels
function slugifyUser(u = "") {
  return u
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")       // spaces -> hyphens
    .replace(/[^a-z0-9\-_.]/g, ""); // strip weird chars but keep - _ .
}

// Ensure a label exists in GitHub
async function ensureLabelExists({ owner, repo, token, name, color = "ededed", description = "" }) {
  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (getRes.status === 200) return; // already exists

    // Only create if not found (ignore 404 is expected)
    if (getRes.status === 404) {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, color, description }),
      });
    }
  } catch (err) {
    console.error(`❌ ensureLabelExists failed for ${name}:`, err);
  }
}

// -----------------------------
// Create GitHub Issue
// -----------------------------
app.post("/create-issue", async (req, res) => {
  const { title, body } = req.body;

  const appUser = req.session?.user?.username || "Unknown";
  const environment = (req.session?.environment || "Sandbox").toLowerCase();

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    return res.status(500).json({ success: false, error: "Missing GitHub configuration" });
  }

  const appUserLabel = `appuser:${slugifyUser(appUser)}`;
  const envLabel = environment;
  const labels = ["alpha-feedback", envLabel, appUserLabel];

  try {
    // Ensure required labels exist
    await ensureLabelExists({
      owner,
      repo,
      token,
      name: "alpha-feedback",
      color: "0081AB",
      description: "SuitePim alpha feedback",
    });
    await ensureLabelExists({
      owner,
      repo,
      token,
      name: envLabel,
      color: envLabel === "production" ? "d73a4a" : "a2eeef",
      description: envLabel === "production" ? "Production environment" : "Sandbox environment",
    });
    await ensureLabelExists({
      owner,
      repo,
      token,
      name: appUserLabel,
      color: "ededed",
      description: "SuitePim reporter",
    });

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body, labels }),
    });

    const data = await ghRes.json();

    if (ghRes.ok) {
      res.json({ success: true, issueUrl: data.html_url });
    } else {
      console.error("❌ Create issue failed:", data);
      res.status(500).json({ success: false, error: data });
    }
  } catch (err) {
    console.error("❌ GitHub issue creation error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// -----------------------------
// Get open issues
// -----------------------------
app.get("/issues", async (req, res) => {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    return res.status(500).json({ error: "Missing GitHub configuration" });
  }

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=open`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    const data = await ghRes.json();

    if (!ghRes.ok) {
      console.error("❌ GitHub issues fetch failed:", data);
      return res.status(500).json({ error: "Failed to fetch issues" });
    }

    const issues = data.map((issue) => {
      const labelNames = (issue.labels || []).map((l) => l.name);

      // Extract SuitePim username from label
      let appUser = null;
      const userLabel = labelNames.find((n) => /^appuser:/i.test(n));
      if (userLabel) {
        appUser = userLabel.split(":")[1] || "";
        appUser = appUser.replace(/-/g, " ").trim();
      } else if (issue.body) {
        const m = issue.body.match(/(Raised by|Reported by):\s*(.+)/i);
        if (m) appUser = m[2].trim();
      }

      // Infer environment from labels
      let environment = null;
      if (labelNames.includes("production")) environment = "Production";
      else if (labelNames.includes("sandbox")) environment = "Sandbox";

      return {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        user: issue.user,
        created_at: issue.created_at,
        labels: labelNames,
        appUser,
        environment,
      };
    });

    res.json(issues);
  } catch (err) {
    console.error("❌ Failed to fetch issues:", err);
    res.status(500).json({ error: "Failed to fetch issues" });
  }
});


// ------------------------------
// Promotions API: save, list, load
// ------------------------------

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;



// --- SAVE PROMOTION --
// --- SAVE PROMOTION TO GITHUB ---
app.post("/api/savePromotion", async (req, res) => {
  try {
    const { fileName, content } = req.body;
    if (!fileName || !content) {
      return res.status(400).json({ error: "Missing fileName or content" });
    }

    const path = `promotions/${fileName}.json`;
    const apiUrl = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`;

    // Fetch current file SHA (if exists)
    let sha = null;
    const existingRes = await fetch(apiUrl, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
    });
    if (existingRes.ok) {
      const existing = await existingRes.json();
      sha = existing.sha;
    }

    // Commit file to GitHub
    const ghRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        message: `Save promotion ${fileName}.json`,
        content: Buffer.from(content).toString("base64"),
        sha, // include only if updating
      }),
    });

    const data = await ghRes.json();

    if (!ghRes.ok) {
      console.error("❌ GitHub save failed:", data);
      return res.status(500).json({ error: "GitHub save failed", details: data });
    }

    res.json({ success: true, file: data.content.path });
  } catch (err) {
    console.error("❌ Save promotion error:", err);
    res.status(500).json({ error: "Server error", details: String(err) });
  }
});

// enqueue promotion push job
app.post("/push-promotion", authMiddleware, (req, res) => {
  const rowsToPush = req.body.rows;
  if (!rowsToPush || rowsToPush.length === 0) {
    return res.status(400).json({ success: false, message: "No products to push" });
  }

  const jobId = createJobId();
  const envConfig = getEnvConfig(req); // Sandbox/Prod based on session
  const environment = req.session.environment || "Sandbox";

  jobs[jobId] = {
    type: "promotion-push",      // 👈 important for runNextJob
    status: "pending",
    total: rowsToPush.length,
    processed: 0,
    results: [],
    rows: rowsToPush,            // [{ id, salePrice }]
    user: req.session.user,
    envConfig,
    environment,
    createdAt: new Date(),
  };

  jobQueue.push(jobId);
  if (jobQueue.length === 1) runNextJob();

  res.json({
    success: true,
    message: `Promotion push queued with ${rowsToPush.length} product(s)`,
    jobId,
    queuePos: jobQueue.indexOf(jobId) + 1,
    queueTotal: jobQueue.length,
  });
});





// --- LIST PROMOTIONS ---
app.get("/api/promotions", async (req, res) => {
  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/promotions`;
    const ghRes = await fetch(apiUrl, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` },
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      console.error("❌ Failed to fetch promotions list:", err);
      return res.status(500).json({ error: "Failed to fetch promotions" });
    }

    const files = await ghRes.json();
    const promotions = files
      .filter((f) => f.name.endsWith(".json"))
      .map((f) => ({
        name: f.name.replace(".json", ""), // "test_promotion"
        path: f.path, // "promotions/test_promotion.json"
      }));

    res.json(promotions);
  } catch (err) {
    console.error("❌ Error listing promotions:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- GET PROMOTION DETAIL ---
app.get("/api/promotions/:name", async (req, res) => {
  try {
    const { name } = req.params; // e.g. "test_promotion"
    const path = `promotions/${name}.json`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

    const ghRes = await fetch(apiUrl, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` },
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      console.error("❌ Failed to fetch promotion:", err);
      return res.status(500).json({ error: "Failed to fetch promotion" });
    }

    const file = await ghRes.json();
    const content = Buffer.from(file.content, "base64").toString("utf-8");
    res.json(JSON.parse(content));
  } catch (err) {
    console.error("❌ Error fetching promotion:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- LIST PRICING SNAPSHOTS (auto-cleanup files older than 90 days) ---
app.get("/api/pricing", async (req, res) => {
  try {
    const apiUrl = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/pricing`;
    const ghRes = await fetch(apiUrl, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      console.error("❌ Failed to fetch pricing list:", err);
      return res.status(500).json({ error: "Failed to fetch pricing" });
    }

    const files = await ghRes.json();
    if (!Array.isArray(files)) return res.json([]);

    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const pricingFiles = [];

    for (const f of files) {
      if (!f.name.endsWith(".json")) continue;

      let deleteThis = false;

      try {
        // Get the last commit date for this file
        const commitsUrl = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/commits?path=${encodeURIComponent(
          f.path
        )}&per_page=1`;
        const commitRes = await fetch(commitsUrl, {
          headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
        });

        if (commitRes.ok) {
          const commits = await commitRes.json();
          if (Array.isArray(commits) && commits.length > 0) {
            const commitDate = new Date(
              commits[0].commit.committer.date
            ).getTime();
            const age = now - commitDate;
            if (age > ninetyDays) {
              deleteThis = true;
            }
          }
        }
      } catch (metaErr) {
        console.warn(`⚠️ Could not check age for ${f.path}:`, metaErr);
      }

      if (deleteThis) {
        console.log(`🧹 Auto-deleting historical file older than 90 days: ${f.path}`);
        await deleteGitHubFile(f.path);
        continue; // skip adding to list
      }

      pricingFiles.push({
        name: f.name.replace(".json", ""),
        path: f.path,
      });
    }

    res.json(pricingFiles);
  } catch (err) {
    console.error("❌ Error listing pricing files:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// --- GET SINGLE PRICING SNAPSHOT ---
app.get("/api/pricing/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const path = `pricing/${name}.json`;
    const apiUrl = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`;

    const ghRes = await fetch(apiUrl, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      console.error("❌ Failed to fetch pricing snapshot:", ghRes.status, err);
      return res.status(ghRes.status).json({
        error: "Failed to fetch pricing file",
        status: ghRes.status,
        details: err
      });
    }

    const file = await ghRes.json();

    // ✅ Case 1: small files (content inline)
    if (file.content && file.encoding === "base64") {
      const content = Buffer.from(file.content, "base64").toString("utf-8");
      return res.json(JSON.parse(content));
    }

    // ✅ Case 2: large files (use download_url)
    if (file.download_url) {
      const rawRes = await fetch(file.download_url);
      if (!rawRes.ok) throw new Error("Failed to fetch raw file content");
      const text = await rawRes.text();
      return res.json(JSON.parse(text));
    }

    throw new Error("File has no content or download URL");
  } catch (err) {
    console.error("❌ Error fetching pricing file:", err);
    res.status(500).json({ error: "Server error", details: String(err) });
  }
});






// --- SAVE PRICING SNAPSHOT ---
app.post("/api/savePricingSnapshot", async (req, res) => {
  try {
    const { fileName, content } = req.body;
    if (!fileName || !content) {
      return res.status(400).json({ error: "Missing fileName or content" });
    }

    // Save to "pricing" folder instead of "promotions"
    const path = `pricing/${fileName}.json`;
    const apiUrl = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`;

    // Check if file already exists (so we can include SHA if updating)
    let sha = null;
    const existingRes = await fetch(apiUrl, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
    });
    if (existingRes.ok) {
      const existing = await existingRes.json();
      sha = existing.sha;
    }

    // Commit file to GitHub
    const ghRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        message: `Save pricing snapshot ${fileName}.json`,
        content: Buffer.from(content).toString("base64"),
        sha,
      }),
    });

    const data = await ghRes.json();

    if (!ghRes.ok) {
      console.error("❌ GitHub save failed:", data);
      return res.status(500).json({ error: "GitHub save failed", details: data });
    }

    res.json({ success: true, file: data.content.path });
  } catch (err) {
    console.error("❌ Save pricing snapshot error:", err);
    res.status(500).json({ error: "Server error", details: String(err) });
  }
});




// -----------------------------
// Logout
// -----------------------------
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Error logging out");
    res.json({ success: true });
  });
});

/* -----------------------------
   Static pages
------------------------------*/
 app.get("/home.html", authMiddleware, (req, res) => {
  res.sendFile(join(__dirname, "public", "home.html"));
});

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.get("/fieldmap", authMiddleware, (req, res) => {
  res.json(fieldMap);
});

app.get("/WoocommerceConnector.html", authMiddleware, (req, res) => {
  res.sendFile(join(__dirname, "public", "WoocommerceConnector.html"));
});





/* -----------------------------
   GitHub Issues Integration
------------------------------*/

// Get open issues
app.get("/issues", async (req, res) => {
  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/issues?state=open`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    const data = await ghRes.json();

    // Make sure we return the GitHub "number" field (needed for comments API)
    const issues = data.map(issue => ({
      number: issue.number,          // ✅ required
      title: issue.title,
      body: issue.body,
      user: issue.user,
      created_at: issue.created_at,
      labels: issue.labels.map(l => l.name),
    }));

    res.json(issues);
  } catch (err) {
    console.error("Failed to fetch issues:", err);
    res.status(500).json({ error: "Failed to fetch issues" });
  }
});

// Get comments for a specific issue
// Get comments for a specific issue
app.get("/issues/:number/comments", async (req, res) => {
  try {
    const { number } = req.params;


    const ghRes = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/issues/${number}/comments`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    const data = await ghRes.json();

    if (!ghRes.ok) {
      console.error("❌ GitHub comments fetch failed:", data);
      return res.status(ghRes.status).json({
        error: "GitHub error",
        status: ghRes.status,
        details: data
      });
    }

    res.json(data);
  } catch (err) {
    console.error("❌ Failed to fetch issue comments:", err);
    res.status(500).json({ error: "Failed to fetch comments", details: String(err) });
  }
});

// Post a new comment to a specific issue
app.post("/issues/:number/comment", async (req, res) => {
  try {
    const { number } = req.params;
    const { body } = req.body;
    const appUser = req.session?.user?.username || "Unknown";

    const commentBody = `**[${appUser}]**\n${body}`;

    console.log("✍️ Posting comment on issue:", number, {
      appUser,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      hasToken: !!process.env.GITHUB_TOKEN
    });

    const ghRes = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/issues/${number}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: commentBody }),
      }
    );

    const data = await ghRes.json();

    if (ghRes.ok) {
      res.json({ success: true, comment: data });
    } else {
      console.error("❌ GitHub post comment failed:", data);
      res.status(ghRes.status).json({
        success: false,
        error: "GitHub error",
        status: ghRes.status,
        details: data
      });
    }
  } catch (err) {
    console.error("❌ Failed to post comment:", err);
    res.status(500).json({ error: "Failed to post comment", details: String(err) });
  }
});


// Post a new comment to a specific issue
app.post("/issues/:number/comment", async (req, res) => {
  try {
    const { number } = req.params;
    const { body } = req.body;
    const appUser = req.session?.user?.username || "Unknown";

    const commentBody = `**[${appUser}]**\n${body}`;

    const ghRes = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/issues/${number}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: commentBody }),
      }
    );

    const data = await ghRes.json();

    if (ghRes.ok) {
      res.json({ success: true, comment: data });
    } else {
      console.error("GitHub error:", data);
      res.status(500).json({ success: false, error: data });
    }
  } catch (err) {
    console.error("Failed to post comment:", err);
    res.status(500).json({ error: "Failed to post comment" });
  }
});


app.get("/api/item/:id/history", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  const envConfig = getEnvConfig(req);

  try {
    const results = {
      id,
      purchasePrice: null,
      history: [],
      debug: {}
    };

    // --- 1️⃣ Get current purchase price ---
    const itemUrl = `${envConfig.restUrl}/inventoryItem/${id}`;
    const itemRes = await fetch(itemUrl, {
      method: "GET",
      headers: {
        ...getAuthHeader(itemUrl, "GET", user.tokenId, user.tokenSecret, envConfig),
        "Content-Type": "application/json"
      }
    });

    const itemText = await itemRes.text();
    let itemData;
    try { itemData = JSON.parse(itemText); } catch { itemData = { raw: itemText }; }

    results.purchasePrice = itemData?.cost ?? null;

    // --- 2️⃣ Query System Notes (SuiteQL) for price-related changes ---
    const suiteQL = `
      SELECT
        TO_CHAR(date, 'YYYY-MM-DD HH24:MI:SS') AS date,
        name AS user,
        field,
        oldvalue,
        newvalue
      FROM systemnote
      WHERE recordid = ${id}
        AND field IN ('INVTITEM.PRICELIST', 'INVTITEM.COST')
      ORDER BY date DESC
      FETCH NEXT 50 ROWS ONLY
    `;

    const suiteQLUrl = envConfig.restUrl.replace(/\/record\/v1$/i, "") + "/query/v1/suiteql";
    console.log("➡️ SuiteQL query (audit trail):", suiteQLUrl);

    const queryRes = await fetch(suiteQLUrl, {
      method: "POST",
      headers: {
        ...getAuthHeader(suiteQLUrl, "POST", user.tokenId, user.tokenSecret, envConfig),
        "Content-Type": "application/json",
        "Prefer": "transient"
      },
      body: JSON.stringify({ q: suiteQL })
    });

    const queryText = await queryRes.text();
    let queryJson;
    try { queryJson = JSON.parse(queryText); } catch { queryJson = { raw: queryText }; }

    results.debug.queryStatus = queryRes.status;
    results.debug.querySnippet = queryText.slice(0, 400);

    if (Array.isArray(queryJson?.items)) {
      results.history = queryJson.items.map((r) => {
        const fieldName =
          r.field === "INVTITEM.PRICELIST"
            ? "Base Price"
            : r.field === "INVTITEM.COST"
            ? "Purchase Price"
            : r.field;

        return {
          Date: r.date,
          User: r.user,
          Field: fieldName,
          OldValue: r.oldvalue,
          NewValue: r.newvalue
        };
      });
    }

    // --- 3️⃣ Return the data ---
    res.json({
      success: true,
      purchasePrice: results.purchasePrice,
      totalRecords: results.history.length,
      history: results.history,
      debug: results.debug
    });
  } catch (err) {
    console.error("❌ Historical pricing API error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* -----------------------------
   Job Queue System
------------------------------*/
const jobs = {};     // { jobId: { status, total, processed, results, queuePos, envConfig, ... } }
const jobQueue = []; // active job IDs in order

function createJobId() {
  return Math.random().toString(36).substring(2, 10);
}

function getImageEndpoint(environment) {
  if (environment.toLowerCase() === "production") {
    return process.env.NETSUITE_PROD_IMAGE_ENDPOINT;
  }
  return process.env.NETSUITE_SANDBOX_IMAGE_ENDPOINT;
}

const MAX_CONCURRENT = 4;

// 🔹 Handles a single row (all your existing logic moved here)
async function processRow(row, { job, type, user, envConfig, environment }) {
  // default result scaffold
  let rowResult = { status: "Pending", response: {} };

  try {
    // --- Validation jobs ---
    if (type === "validation") {
      rowResult = { internalid: row.internalid, status: "Pending", response: null };
      if (!row.internalid) {
        rowResult.status = "Skipped";
        rowResult.response = { reason: "Missing Internal ID" };
        return rowResult;
      }

      const payload = row.fields || {};
      const url = `${envConfig.restUrl}/inventoryItem/${row.internalid}`;
      const { tokenId, tokenSecret } = user;

      console.log(`➡️ [Validation] PATCH ${url}`);
      console.log("   Payload:", JSON.stringify(payload));

      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          ...getAuthHeader(url, "PATCH", tokenId, tokenSecret, envConfig),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      try { rowResult.response = text ? JSON.parse(text) : { status: "No Content (204)" }; }
      catch { rowResult.response = text || { status: "No Content (204)" }; }

      console.log("⬅️ [Validation] Response:", rowResult.response);
      rowResult.status = "Success";
      return rowResult;
    }

    // --- Promotion Push jobs ---
    if (type === "promotion-push") {
      rowResult = { id: row.id, name: row.name, status: "Pending", response: {} };
      try {
        const priceUrl = `${envConfig.restUrl}/inventoryItem/${row.id}/price`;
        const { tokenId, tokenSecret } = user;

        const priceGetRes = await fetch(priceUrl, {
          method: "GET",
          headers: { ...getAuthHeader(priceUrl, "GET", tokenId, tokenSecret, envConfig), "Content-Type": "application/json" },
        });

        const priceGetText = await priceGetRes.text();
        let priceGetData; try { priceGetData = JSON.parse(priceGetText); } catch { priceGetData = priceGetText; }

        if (Array.isArray(priceGetData?.items)) {
          for (const item of priceGetData.items) {
            const selfLink = item.links?.find((l) => l.rel === "self")?.href;
            if (!selfLink || !selfLink.includes("pricelevel=4")) continue;

            const currentRes = await fetch(selfLink, {
              method: "GET",
              headers: { ...getAuthHeader(selfLink, "GET", tokenId, tokenSecret, envConfig), "Content-Type": "application/json" },
            });
            const currentText = await currentRes.text();
            let currentData; try { currentData = JSON.parse(currentText); } catch { currentData = currentText; }

            const newSalePrice = parseFloat(row.salePrice);
            const newRegularPrice = parseFloat(row.basePrice || 0);

            if (currentData.price !== newSalePrice) {
              const patchBody = { price: newSalePrice };
              console.log(`➡️ [NetSuite] PATCH ${selfLink}`);
              console.log("   Payload:", JSON.stringify(patchBody));

              const priceRes = await fetch(selfLink, {
                method: "PATCH",
                headers: { ...getAuthHeader(selfLink, "PATCH", tokenId, tokenSecret, envConfig), "Content-Type": "application/json", Prefer: "return=representation" },
                body: JSON.stringify(patchBody),
              });

              const priceText = await priceRes.text();
              let priceData; try { priceData = JSON.parse(priceText); } catch { priceData = priceText; }

              console.log("⬅️ [NetSuite] Response:", priceData);
              rowResult.response.netsuite = priceData;
              rowResult.status = "Success";
            } else {
              rowResult.response.netsuite = { skipped: true, reason: "Already correct" };
              rowResult.status = "Skipped";
            }

            // 🔄 WooCommerce sync
            try {
              const wooApi = getWooApi(environment);
              if (row.wooId) {
                const { data: product } = await wooApi.get(`products/${row.wooId}`);
                const updatePayload = { regular_price: newRegularPrice.toFixed(2), sale_price: newSalePrice.toFixed(2) };

                let wooResponse;
                if (product.parent_id && product.parent_id !== 0) {
                  wooResponse = await wooApi.put(`products/${product.parent_id}/variations/${product.id}`, updatePayload);
                } else {
                  wooResponse = await wooApi.put(`products/${product.id}`, updatePayload);
                }

                console.log("⬅️ [WooCommerce] Response:", wooResponse.data);
                rowResult.response.woocommerce = { success: true, ...wooResponse.data };
              } else {
                rowResult.response.woocommerce = { skipped: true, reason: "Missing Woo Id" };
              }
            } catch (wooErr) {
              rowResult.response.woocommerce = { error: wooErr.message };
              console.error("❌ WooCommerce update failed:", wooErr.message);
            }
          }
        } else {
          rowResult.status = "Error";
          rowResult.response.netsuite = { error: "Unexpected GET response", data: priceGetData };
        }
      } catch (err) {
        rowResult.status = "Error";
        rowResult.response = { error: String(err) };
        console.error("❌ Promotion push exception:", err);
      }
      return rowResult;
    }

    // --- Default ProductData jobs ---
    rowResult = { itemId: row["Item ID"], status: "Pending", response: { main: null, prices: [], images: [], error: null } };

    if (!row["Internal ID"]) {
      rowResult.status = "Skipped";
      rowResult.response = { reason: "Missing Internal ID" };
      return rowResult;
    }

    const payload = {};
    let basePriceVal;

    for (const field of fieldMap) {
      if (field.name === "Base Price") {
        const val = parseFloat(row[field.name]);
        if (!isNaN(val)) basePriceVal = val;
        continue;
      }
      if (field.fieldType === "multiple-select") {
        const ids = row[`${field.name}_InternalId`];
        if (Array.isArray(ids)) payload[field.internalid] = { items: ids.map((id) => ({ id: String(id) })) };
        continue;
      }
      if (field.name === "Preferred Supplier") {
        const newVendorId = row[`${field.name}_InternalId`] ?? null;
        if (newVendorId) {
          try {
            const vendorUrl = `${envConfig.restUrl}/inventoryItem/${row["Internal ID"]}/itemVendor`;
            const { tokenId, tokenSecret } = user;

            const vendorRes = await fetch(vendorUrl, {
              method: "GET",
              headers: { ...getAuthHeader(vendorUrl, "GET", tokenId, tokenSecret, envConfig), "Content-Type": "application/json" },
            });

            const vendorText = await vendorRes.text();
            let vendorData; try { vendorData = JSON.parse(vendorText); } catch { vendorData = vendorText; }

            if (Array.isArray(vendorData?.items) && vendorData.items.length > 0) {
              const lastLine = vendorData.items[vendorData.items.length - 1];
              const selfLink = lastLine.links?.find(l => l.rel === "self")?.href;
              if (selfLink) {
                const patchBody = { vendor: { id: String(newVendorId) }, subsidiary: { id: "6" }, preferred: true, currency: { id: "1" } };
                console.log(`➡️ [NetSuite] PATCH Preferred Supplier ${selfLink}`);
                console.log("   Payload:", JSON.stringify(patchBody));

                const patchRes = await fetch(selfLink, {
                  method: "PATCH",
                  headers: { ...getAuthHeader(selfLink, "PATCH", tokenId, tokenSecret, envConfig), "Content-Type": "application/json", Prefer: "return=representation" },
                  body: JSON.stringify(patchBody),
                });

                const patchText = await patchRes.text();
                let patchData; try { patchData = JSON.parse(patchText); } catch { patchData = patchText; }
                console.log("⬅️ [NetSuite] Response:", patchData);
              }
            }
          } catch (err) {
            console.error("❌ Preferred Supplier update failed:", err);
          }
        }
        continue;
      }
      if (field.fieldType === "List/Record") {
        const internalId = row[`${field.name}_InternalId`] ?? null;
        if (internalId !== null && internalId !== "") payload[field.internalid] = { id: String(internalId) };
        continue;
      }
      if (field.fieldType === "image") {
        const fileId = row[`${field.name}_InternalId`];
        if (fileId && String(fileId).trim() !== "") {
          const suiteletUrl = getImageEndpoint(environment);
          const url = `${suiteletUrl}&itemid=${row["Internal ID"]}&fileid=${fileId}&fieldid=${field.internalid}`;
          try {
            const res = await fetch(url, { method: "GET" });
            const text = await res.text();
            let data; try { data = JSON.parse(text); } catch { data = text; }
            rowResult.response.images.push({ field: field.internalid, result: data });
          } catch (err) {
            rowResult.response.images.push({ field: field.internalid, error: String(err) });
          }
        }
        continue;
      }
      const value = row[field.name];
      if (value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "")) {
        if (field.fieldType === "Currency") {
          payload[field.internalid] = parseFloat(value) || 0;
        } else if (field.fieldType === "Checkbox") {
          const v = (typeof value === "string" ? value.trim().toLowerCase() : value);
          payload[field.internalid] = v === true || v === 1 || ["true", "t", "1", "y", "yes"].includes(v);
        } else {
          payload[field.internalid] = String(value);
        }
      }
    }

    const url = `${envConfig.restUrl}/inventoryItem/${row["Internal ID"]}`;
    const { tokenId, tokenSecret } = user;

    if (Object.keys(payload).length > 0) {
      console.log(`➡️ [NetSuite] PATCH ${url}`);
      console.log("   Payload:", JSON.stringify(payload));

      const response = await fetch(url, {
        method: "PATCH",
        headers: { ...getAuthHeader(url, "PATCH", tokenId, tokenSecret, envConfig), "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      try { rowResult.response.main = text ? JSON.parse(text) : { status: "No Content (204)" }; }
      catch { rowResult.response.main = text || { status: "No Content (204)" }; }

      console.log("⬅️ [NetSuite] Response:", rowResult.response.main);
    }

    // base price update
    if (basePriceVal !== undefined) {
      const priceUrl = `${envConfig.restUrl}/inventoryItem/${row["Internal ID"]}/price`;
      const priceGetRes = await fetch(priceUrl, {
        method: "GET",
        headers: { ...getAuthHeader(priceUrl, "GET", tokenId, tokenSecret, envConfig), "Content-Type": "application/json" },
      });

      const priceGetText = await priceGetRes.text();
      let priceGetData; try { priceGetData = JSON.parse(priceGetText); } catch { priceGetData = priceGetText; }

      if (Array.isArray(priceGetData?.items)) {
        for (const item of priceGetData.items) {
          const selfLink = item.links?.find((l) => l.rel === "self")?.href;
          if (!selfLink || !selfLink.includes("pricelevel=1")) continue;

          const currentRes = await fetch(selfLink, {
            method: "GET",
            headers: { ...getAuthHeader(selfLink, "GET", tokenId, tokenSecret, envConfig), "Content-Type": "application/json" },
          });

          const currentText = await currentRes.text();
          let currentData; try { currentData = JSON.parse(currentText); } catch { currentData = currentText; }

          if (currentData.price !== basePriceVal) {
            const patchBody = { price: basePriceVal };
            console.log(`➡️ [NetSuite] PATCH Base Price ${selfLink}`);
            console.log("   Payload:", JSON.stringify(patchBody));

            const priceRes = await fetch(selfLink, {
              method: "PATCH",
              headers: { ...getAuthHeader(selfLink, "PATCH", tokenId, tokenSecret, envConfig), "Content-Type": "application/json", Prefer: "return=representation" },
              body: JSON.stringify(patchBody),
            });

            const priceText = await priceRes.text();
            let priceData; try { priceData = JSON.parse(priceText); } catch { priceData = priceText; }
            console.log("⬅️ [NetSuite] Response:", priceData);
            rowResult.response.prices.push({ link: selfLink, newValue: basePriceVal, result: priceData });
          }
        }
      }
    }

    rowResult.status = rowResult.response.error || (rowResult.response.main && rowResult.response.main.error) ? "Error" : "Success";
  } catch (err) {
    rowResult.status = "Error";
    rowResult.response.error = String(err);
    console.error("❌ ProductData exception:", err);
  }

  return rowResult;
}

// 🔹 New concurrent runner
async function runNextJob() {
  if (jobQueue.length === 0) return;

  const jobId = jobQueue[0];
  const job = jobs[jobId];
  if (!job || job.status !== "pending") return;

  job.status = "running";
  job.startedAt = new Date();

  const results = [];
  const { rows, user, envConfig, environment, type } = job;

  console.log(`\n🌐 Environment: ${environment} (${envConfig.accountDash}) | 👤 User: ${user.username} | 🧾 Records: ${rows.length}`);

  let rowIndex = 0;
  async function worker(workerId) {
    while (true) {
      const i = rowIndex++;
      if (i >= rows.length) return;
      const row = rows[i];
      if (!jobs[jobId]) return; // cancelled mid-run

      const rowResult = await processRow(row, { job, type, user, envConfig, environment });
      results.push(rowResult);
      job.processed++;
    }
  }

  const workers = Array.from({ length: MAX_CONCURRENT }, (_, i) => worker(i));
  await Promise.all(workers);

  job.results = results;
  job.status = "completed";
  job.finishedAt = new Date();
  jobQueue.shift();

  const successCount = results.filter(r => r.status === "Success").length;
  const errorCount = results.filter(r => r.status === "Error").length;
  const skippedCount = results.filter(r => r.status === "Skipped").length;

  console.log(`\n📊 Job Summary: ✅ ${successCount} | ❌ ${errorCount} | ⚠️ ${skippedCount}\n`);

  // ✅ Perform cleanup BEFORE starting the next job
  if (job.type === "historical-pricing") {
    if (job.originalFilePath) {
      console.log(`🧹 Attempting to delete processed historical file: ${job.originalFilePath}`);

      try {
        const deleted = await deleteGitHubFile(job.originalFilePath);
        if (deleted) {
          console.log(`✅ Historical pricing file removed: ${job.originalFilePath}`);
        } else {
          console.warn(`⚠️ Could not delete historical pricing file: ${job.originalFilePath}`);
        }
      } catch (err) {
        console.error(`❌ Error deleting historical pricing file: ${err.message}`);
      }
    } else {
      console.warn("⚠️ Historical pricing job had no originalFilePath set.");
    }
  }

  // ✅ Now safely run the next job in sequence
  await runNextJob();
}





// enqueue job with the current env
app.post("/push-updates", authMiddleware, (req, res) => {
  const rowsToPush = req.body.rows;
  if (!rowsToPush || rowsToPush.length === 0) {
    return res.status(400).json({ success: false, message: "No rows to push" });
  }

  const jobId = createJobId();
  const envConfig = getEnvConfig(req); // Sandbox/Prod based on session
  const environment = req.session.environment || "Sandbox"; // <-- add this

  jobs[jobId] = {
    status: "pending",
    total: rowsToPush.length,
    processed: 0,
    results: [],
    rows: rowsToPush,
    user: req.session.user,
    envConfig,
    environment,               // <-- store human-readable env name
    createdAt: new Date(),
  };

  jobQueue.push(jobId);
  if (jobQueue.length === 1) runNextJob();

  res.json({
    success: true,
    message: `Job queued with ${rowsToPush.length} row(s)`,
    jobId,
    queuePos: jobQueue.indexOf(jobId) + 1,
    queueTotal: jobQueue.length,
  });
});

app.post("/push-pricing", authMiddleware, (req, res) => {
  const { rows, fileName } = req.body; // ✅ receive fileName from frontend
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: "No rows to push" });
  }

  const jobId = createJobId();
  const envConfig = getEnvConfig(req);
  const environment = req.session.environment || "Sandbox";

  jobs[jobId] = {
    type: "historical-pricing",
    status: "pending",
    total: rows.length,
    processed: 0,
    results: [],
    rows,
    user: req.session.user,
    envConfig,
    environment,
    createdAt: new Date(),
    // ✅ store file path for cleanup
    originalFilePath: fileName ? `pricing/${fileName}.json` : null,
  };

  jobQueue.push(jobId);
  if (jobQueue.length === 1) runNextJob();

  console.log(`📦 Queued historical pricing job ${jobId} for file: ${jobs[jobId].originalFilePath}`);
  res.json({
    success: true,
    message: `Historical pricing job queued with ${rows.length} row(s)`,
    jobId,
    queuePos: jobQueue.indexOf(jobId) + 1,
    queueTotal: jobQueue.length,
  });
});


// --- DELETE FILE FROM GITHUB REPO (safe + verbose) ---
async function deleteGitHubFile(filePath) {
  try {
    // 🧩 Normalize path and extension
    if (!filePath) {
      console.warn("⚠️ deleteGitHubFile called without filePath");
      return false;
    }
    if (!filePath.startsWith("pricing/")) {
      filePath = `pricing/${filePath}`;
    }
    if (!filePath.endsWith(".json")) {
      filePath = `${filePath}.json`;
    }

    const apiUrl = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${filePath}`;
    console.log(`🧾 [deleteGitHubFile] Target: ${apiUrl}`);

    // Step 1: get file SHA
    const ghRes = await fetch(apiUrl, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
    });

    if (!ghRes.ok) {
      const text = await ghRes.text();
      console.warn(`⚠️ File not found or cannot fetch SHA for ${filePath} — ${text}`);
      return false;
    }

    const file = await ghRes.json();
    const sha = file.sha;
    if (!sha) {
      console.error(`❌ No SHA returned for ${filePath}`);
      return false;
    }

    // Step 2: delete file via API
    const deleteRes = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `🧹 Delete processed historical pricing file: ${filePath}`,
        sha,
      }),
    });

    if (!deleteRes.ok) {
      const errText = await deleteRes.text();
      console.error(`❌ GitHub delete failed for ${filePath}: ${errText}`);
      return false;
    }

    console.log(`✅ GitHub file deleted successfully: ${filePath}`);
    return true;
  } catch (err) {
    console.error(`❌ Error deleting GitHub file (${filePath}):`, err);
    return false;
  }
}



// enqueue validation job
app.post("/push-validation", authMiddleware, (req, res) => {
  const rowsToPush = req.body.rows;
  if (!rowsToPush || rowsToPush.length === 0) {
    return res.status(400).json({ success: false, message: "No rows to push" });
  }

  const jobId = createJobId();
  const envConfig = getEnvConfig(req); // Sandbox/Prod
  const environment = req.session.environment || "Sandbox";

  jobs[jobId] = {
    type: "validation",          // 👈 this is critical
    status: "pending",
    total: rowsToPush.length,
    processed: 0,
    results: [],
    rows: rowsToPush,
    user: req.session.user,
    envConfig,
    environment,
    createdAt: new Date(),
  };

  jobQueue.push(jobId);
  if (jobQueue.length === 1) runNextJob();

  res.json({
    success: true,
    message: `Validation job queued with ${rowsToPush.length} row(s)`,
    jobId,
    queuePos: jobQueue.indexOf(jobId) + 1,
    queueTotal: jobQueue.length,
  });
});

app.get("/debug-env", (req, res) => {
  res.json({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    hasToken: !!process.env.GITHUB_TOKEN,
    tokenPreview: process.env.GITHUB_TOKEN
      ? process.env.GITHUB_TOKEN.slice(0, 6) + "...(hidden)"
      : "MISSING"
  });
});

app.get("/push-status/:jobId", authMiddleware, (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found" });
  }
  job.queuePos = jobQueue.indexOf(req.params.jobId) + 1 || 0;
  job.queueTotal = jobQueue.length;
  res.json(job);
});



/* -----------------------------
   Start
------------------------------*/
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});




