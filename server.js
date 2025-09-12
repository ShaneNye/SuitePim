// server.js
import express from "express";
import path, { dirname, join } from "path";
import bodyParser from "body-parser";
import session from "express-session";
import fetch from "node-fetch";
import OAuth from "oauth-1.0a";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { users } from "./users.js";
import { fieldMap } from "./public/js/fieldMap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

/* -----------------------------
   NetSuite Environment Configs
------------------------------*/
const NETSUITE_SANDBOX = {
  account: "7972741_SB1",
  accountDash: "7972741-sb1",
  consumerKey: "0c38d6cca31b16131b85cf3ee2eb63c4926f689ba5214a92140f6aec81299eb6",
  consumerSecret: "cefb221b37198c4d5e779855467cf6713b31aa7e78ce59c250f174b544c8c2cc",
  restUrl: "https://7972741-sb1.suitetalk.api.netsuite.com/services/rest/record/v1",
};

const NETSUITE_PROD = {
  account: "7972741",
  accountDash: "7972741",
  consumerKey: "4a7970825a910c35b8cf4e521c8fa3d3de31798b384d7eb4536c5fe6148fd8c1",
  consumerSecret: "8ebf8e04f3f51685280b32e68e7a751089d33dff81ab65e0084836326175032d",
  restUrl: "https://7972741.suitetalk.api.netsuite.com/services/rest/record/v1",
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
    res.json({ success: false, message: "Invalid username or password!" });
  }
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
  const { rows, user, envConfig, environment } = job;

  console.log(`\n🌐 Environment: ${environment} (${envConfig.accountDash})`);
  console.log(`👤 User: ${user.username}`);
  console.log(`🧾 Records to send: ${rows.length}`);

  for (const row of rows) {
    if (!jobs[jobId]) return; // cancelled mid-run

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

            // ✅ PATCH only Base Price rows (pricelevel=1)
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

      // ✅ Normalize final row status
      if (rowResult.response.error) {
        rowResult.status = "Error";
        console.error(`❌ Error flagged for item ${rowResult.itemId}:`, rowResult.response.error);
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
