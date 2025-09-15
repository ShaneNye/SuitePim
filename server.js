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

// ✅ Load .env safely (no crash if missing)
import fs from "fs";

// ✅ Safe .env loader (works in dev + packaged)
try {
  // Packaged app → resources/.env
  const packagedEnv = path.join(process.resourcesPath || "", ".env");
  if (process.resourcesPath && fs.existsSync(packagedEnv)) {
    dotenv.config({ path: packagedEnv });
    console.log("✅ Loaded .env from packaged:", packagedEnv);
  } else {
    // Dev → project root
    const devEnv = path.join(__dirname, ".env");
    if (fs.existsSync(devEnv)) {
      dotenv.config({ path: devEnv });
      console.log("✅ Loaded .env from dev:", devEnv);
    } else {
      console.warn("⚠️ No .env found — GitHub features may not work");
    }
  }
} catch (err) {
  console.error("❌ Failed to load .env:", err.message);
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
const PORT = 3000;

// ✅ Serve static files
const staticPath = path.join(__dirname, "public");
app.use(express.static(staticPath));
console.log("📂 Serving static files from:", staticPath);

const publicPath = process.env.NODE_ENV === "development"
  ? path.join(__dirname, "public")
  : path.join(process.resourcesPath, "public");

app.use("/public", express.static(publicPath));

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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 60 * 1000 },
  })
);

function authMiddleware(req, res, next) {
  if (req.session.user) next();
  else res.redirect("/");
}

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

    console.log("🔍 Fetching comments for issue:", number, {
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      hasToken: !!process.env.GITHUB_TOKEN
    });

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




/* -----------------------------
   Job Queue System
------------------------------*/
const jobs = {};     // { jobId: { status, total, processed, results, queuePos, envConfig, ... } }
const jobQueue = []; // active job IDs in order

function createJobId() {
  return Math.random().toString(36).substring(2, 10);
}

async function runNextJob() {
  if (jobQueue.length === 0) return;

  const jobId = jobQueue[0];
  const job = jobs[jobId];
  if (!job || job.status !== "pending") return;

  job.status = "running";
  job.startedAt = new Date();

  const results = [];
  const { rows, user, envConfig, environment, type } = job;

  console.log(`\n🌐 Environment: ${environment} (${envConfig.accountDash})`);
  console.log(`👤 User: ${user.username}`);
  console.log(`🧾 Records to send: ${rows.length}`);

  for (const row of rows) {
    if (!jobs[jobId]) return; // cancelled mid-run

    // --- Validation job branch ---
    if (type === "validation") {
      const rowResult = {
        internalid: row.internalid,
        status: "Pending",
        response: null,
      };

      try {
        if (!row.internalid) {
          rowResult.status = "Skipped";
          rowResult.response = { reason: "Missing Internal ID" };
          results.push(rowResult);
          continue;
        }

        const payload = row.fields || {};
        const url = `${envConfig.restUrl}/inventoryItem/${row.internalid}`;
        const { tokenId, tokenSecret } = user;

        console.log(`➡️ [${environment}] PATCH ${url}`);
        console.log("🔑 Payload:\n", JSON.stringify(payload, null, 2));

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
        try {
          rowResult.response = text ? JSON.parse(text) : { status: "No Content (204)" };
        } catch {
          rowResult.response = text || { status: "No Content (204)" };
        }

        rowResult.status = "Success";
        console.log(`⬅️ [${environment}] Response:`, rowResult.response);
      } catch (err) {
        rowResult.status = "Error";
        rowResult.response = String(err);
        console.error(`❌ Exception for item ${row.internalid}:`, err);
      }

      results.push(rowResult);
      job.processed++;
      continue; // go to next row
    }

    // --- Default branch: ProductData job ---
    const rowResult = {
      itemId: row["Item ID"],
      status: "Pending",
      response: {
        main: null,
        prices: [],
        error: null,
      },
    };

    try {
      if (!row["Internal ID"]) {
        rowResult.status = "Skipped";
        rowResult.response = { reason: "Missing Internal ID" };
        results.push(rowResult);
        continue;
      }

      // --- Build main payload ---
      const payload = {};
      let basePriceVal;

      for (const field of fieldMap) {
        const value = row[field.name];
        if (value === undefined || value === null || value === "") continue;

        if (field.name === "Base Price") {
          const val = parseFloat(value);
          if (!isNaN(val)) basePriceVal = val;
          continue; // handled separately
        }

        if (field.fieldType === "List/Record") {
          const internalId = row[`${field.name}_InternalId`] || value;
          payload[field.internalid] = {
            id: String(internalId),
            refName: value,
            type: field.internalid,
          };
        } else if (field.fieldType === "Currency") {
          payload[field.internalid] = parseFloat(value) || 0;
        } else if (field.fieldType === "Checkbox") {
          payload[field.internalid] =
            String(value).toLowerCase() === "true" || value === "1";
        } else {
          payload[field.internalid] = String(value);
        }
      }

      const url = `${envConfig.restUrl}/inventoryItem/${row["Internal ID"]}`;
      const { tokenId, tokenSecret } = user;

      console.log(`\n➡️ [${environment}] PATCH ${url}`);
      console.log("🔑 Payload:\n", JSON.stringify(payload, null, 2));

      // --- PATCH main record ---
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
      try {
        rowResult.response.main = text ? JSON.parse(text) : { status: "No Content (204)" };
      } catch {
        rowResult.response.main = text || { status: "No Content (204)" };
      }

      console.log(`⬅️ [${environment}] Response:`, rowResult.response.main);

      // --- Handle Base Price update ---
      if (basePriceVal !== undefined) {
        const priceUrl = `${envConfig.restUrl}/inventoryItem/${row["Internal ID"]}/price`;

        console.log(`\n➡️ [${environment}] GET ${priceUrl}`);
        const priceGetRes = await fetch(priceUrl, {
          method: "GET",
          headers: {
            ...getAuthHeader(priceUrl, "GET", tokenId, tokenSecret, envConfig),
            "Content-Type": "application/json",
          },
        });

        const priceGetText = await priceGetRes.text();
        let priceGetData;
        try {
          priceGetData = JSON.parse(priceGetText);
        } catch {
          priceGetData = priceGetText;
        }

        if (Array.isArray(priceGetData?.items)) {
          for (const item of priceGetData.items) {
            const selfLink = item.links?.find((l) => l.rel === "self")?.href;
            if (!selfLink) continue;

            if (selfLink.includes("pricelevel=1")) {
              const currentRes = await fetch(selfLink, {
                method: "GET",
                headers: {
                  ...getAuthHeader(selfLink, "GET", tokenId, tokenSecret, envConfig),
                  "Content-Type": "application/json",
                },
              });

              const currentText = await currentRes.text();
              let currentData;
              try {
                currentData = JSON.parse(currentText);
              } catch {
                currentData = currentText;
              }

              if (currentData.price !== basePriceVal) {
                const patchBody = { price: basePriceVal };

                console.log(`\n➡️ [${environment}] PATCH ${selfLink}`);
                console.log("🔑 Price Row Payload:\n", JSON.stringify(patchBody, null, 2));

                const priceRes = await fetch(selfLink, {
                  method: "PATCH",
                  headers: {
                    ...getAuthHeader(selfLink, "PATCH", tokenId, tokenSecret, envConfig),
                    "Content-Type": "application/json",
                    Prefer: "return=representation",
                  },
                  body: JSON.stringify(patchBody),
                });

                const priceText = await priceRes.text();
                let priceData;
                if (priceText && priceText.trim().length > 0) {
                  try {
                    priceData = JSON.parse(priceText);
                  } catch {
                    priceData = priceText;
                  }
                } else {
                  priceData = { status: "No Content (204)" };
                }

                console.log(`⬅️ [${environment}] Price Response:`, priceData);

                rowResult.response.prices.push({
                  link: selfLink,
                  newValue: basePriceVal,
                  result: priceData,
                });
              } else {
                console.log(`⚠️ Skipping ${selfLink}, already at ${basePriceVal}`);
              }
            }
          }
        } else {
          console.warn("⚠️ Price GET did not return expected `items` array");
          rowResult.response.prices.push({ error: "Unexpected GET response", data: priceGetData });
        }
      }

      if (rowResult.response.error) {
        rowResult.status = "Error";
      } else if (rowResult.response.main || rowResult.response.prices.length > 0) {
        rowResult.status = "Success";
      } else {
        rowResult.status = "Skipped";
      }
    } catch (err) {
      rowResult.status = "Error";
      rowResult.response.error = String(err);
      console.error(`❌ Exception for item ${row["Item ID"]}:`, err);
    }

    results.push(rowResult);
    job.processed++;
  }

  job.results = results;
  job.status = "completed";
  job.finishedAt = new Date();
  jobQueue.shift();
  runNextJob();
}



// enqueue job with the current env
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




