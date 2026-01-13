// routes/WooConnector.js
import express from "express";
import WooCommerceRestApiPkg from "@woocommerce/woocommerce-rest-api";
import fetch from "node-fetch";

const router = express.Router();
const WooCommerceRestApi = WooCommerceRestApiPkg.default || WooCommerceRestApiPkg;

// ------------------------------------------------------------------
// Woo API factory
// ------------------------------------------------------------------
function getWooApi(env = "Sandbox") {
  const isProd = String(env || "").toLowerCase() === "production";
  return new WooCommerceRestApi({
    url: isProd
      ? process.env.WOOCOMMERCE_PROD_URL
      : process.env.WOOCOMMERCE_URL_SANDBOX,
    consumerKey: isProd
      ? process.env.WOOCOMMERCE_PROD_KEY
      : process.env.WOOCOMMERCE_SANDBOX_KEY,
    consumerSecret: isProd
      ? process.env.WOOCOMMERCE_PROD_SECRET
      : process.env.WOOCOMMERCE_SANDBOX_SECRET,
    version: "wc/v3",
  });
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

// Pick WP base URL for media uploads (must be WordPress site URL that hosts /wp-json/)
function getWpBaseUrl(env = "Sandbox") {
  const isProd = String(env || "").toLowerCase() === "production";
  return isProd
    ? process.env.WOOCOMMERCE_PROD_URL
    : process.env.WOOCOMMERCE_URL_SANDBOX;
}

// ✅ Upload image from NetSuite to WordPress Media Library
async function uploadImageToWoo(imageUrl, position = 0, env = "Sandbox") {
  if (!imageUrl) return null;

  try {
    const match = imageUrl.match(/id=(\d+)/);
    const nsId = match ? match[1] : Math.floor(Math.random() * 999999);
    const fileName = `NS-${nsId}.jpg`;

    console.log(`📥 Fetching image from NetSuite: ${fileName}`);

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image (${imgRes.status})`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    console.log(`⬆️ Uploading image to WordPress: ${fileName}`);

    const wpBase = getWpBaseUrl(env);
    const uploadRes = await fetch(`${wpBase}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.WP_MEDIA_USER}:${process.env.WP_MEDIA_PASS}`
          ).toString("base64"),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "image/jpeg",
      },
      body: imgBuffer,
    });

    const uploadData = await uploadRes.json().catch(() => ({}));

    if (uploadRes.ok && uploadData.id) {
      console.log(`🖼️ Uploaded image ${fileName} → Media ID ${uploadData.id}`);
      return { id: uploadData.id, position };
    } else {
      console.warn(`⚠️ Image upload failed for ${fileName}`, uploadData);
      return null;
    }
  } catch (err) {
    console.error("❌ uploadImageToWoo failed:", err?.message || err);
    return null;
  }
}

// ✅ Category helper (with safeguard)
async function ensureCategory(api, name) {
  if (!name) return null;
  try {
    const { data: list } = await api.get("products/categories", {
      per_page: 100,
    });
    const existing = list.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      console.log(
        `📁 Category already exists → using ${existing.name} (${existing.id})`
      );
      return existing.id;
    }

    const { data: created } = await api.post("products/categories", { name });
    console.log(`📁 Created new category: ${created.name} (${created.id})`);
    return created?.id || null;
  } catch (err) {
    const code = err?.response?.data?.code;
    if (code === "term_exists") {
      const { data: list } = await api.get("products/categories", {
        per_page: 100,
      });
      const existing = list.find(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        console.log(
          `📁 Category already exists → using ${existing.name} (${existing.id})`
        );
        return existing.id;
      }
    }
    console.error("ensureCategory error:", err?.response?.data || err.message);
    return null;
  }
}

async function ensureAttribute(api, name) {
  if (!name) return null;
  const { data: attrs } = await api.get("products/attributes", {
    per_page: 100,
  });
  const existing = attrs.find(
    (a) => a.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.id;
  const { data: created } = await api.post("products/attributes", { name });
  return created?.id || null;
}

async function ensureAttributeTerm(api, attributeId, termName) {
  if (!attributeId || !termName) return null;
  const { data: terms } = await api.get(
    `products/attributes/${attributeId}/terms`,
    { per_page: 100 }
  );
  const existing = terms.find(
    (t) => t.name.toLowerCase() === termName.toLowerCase()
  );
  if (existing) return existing.id;
  const { data: created } = await api.post(
    `products/attributes/${attributeId}/terms`,
    { name: termName }
  );
  return created?.id || null;
}

async function buildGlobalMatrixMeta(api, children) {
  const collected = {};
  for (const c of children) {
    for (const [key, value] of Object.entries(c)) {
      if (key.startsWith("Matrix :") && value && String(value).trim() !== "") {
        const name = key.replace("Matrix :", "").trim();
        collected[name] = collected[name] || new Set();
        collected[name].add(String(value).trim());
      }
    }
  }

  const meta = {};
  for (const [attrName, valsSet] of Object.entries(collected)) {
    const id = await ensureAttribute(api, attrName);
    if (!id) continue;

    const terms = Array.from(valsSet);
    for (const term of terms) {
      await ensureAttributeTerm(api, id, term);
    }
    meta[attrName] = { id, options: terms };
  }
  return meta;
}

// --- SKU lookup helpers (for UPSERT) ---
async function findProductBySku(api, sku) {
  if (!sku) return null;
  const { data } = await api.get("products", { sku, per_page: 1 });
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function findVariationBySku(api, productId, sku) {
  if (!productId || !sku) return null;

  // Woo variations endpoint commonly supports filtering by sku:
  try {
    const { data } = await api.get(`products/${productId}/variations`, {
      sku,
      per_page: 1,
    });
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (e) {
    // Fallback: list and search (in case sku filter isn't supported)
    const { data } = await api.get(`products/${productId}/variations`, {
      per_page: 100,
    });
    return (Array.isArray(data) ? data : []).find(
      (v) => String(v?.sku || "") === String(sku)
    );
  }
}

// ------------------------------------------------------------------
// Main route
// ------------------------------------------------------------------
router.post("/push", async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized – please log in again" });
    }

    const { rows, environment } = req.body || {};
    const env = environment || "Sandbox";

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "No rows received" });
    }

    console.log("🔄 Fetching NS data...");
    const jsonUrl =
      "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4398&deploy=27&compid=7972741&ns-at=AAEJ7tMQe8mVkMCxoDjNgaNNK7UooQa82veIFu24hZGAw7zVxRg";

    const nsRes = await fetch(jsonUrl);
    if (!nsRes.ok) throw new Error(`NetSuite fetch failed: ${nsRes.status}`);

    const nsPayload = await nsRes.json();

    const allDataRaw = Array.isArray(nsPayload)
      ? nsPayload
      : Array.isArray(nsPayload?.results)
      ? nsPayload.results
      : [];

    if (!Array.isArray(allDataRaw) || allDataRaw.length === 0) {
      return res.status(500).json({
        success: false,
        message: "NetSuite payload did not contain an array of results",
        sample:
          nsPayload && typeof nsPayload === "object"
            ? Object.keys(nsPayload).slice(0, 20)
            : typeof nsPayload,
      });
    }

    // Normalize field names you’ve seen in payloads
    const allData = allDataRaw.map((r) => ({
      ...r,
      "Connector ID":
        r["Connector ID"] ??
        r["SuitePim : WooConnector ID"] ??
        r["SuitePim: WooConnector ID"] ??
        "",
    }));

    // --- determine parents/children (uses your current logic) ---
    const selectedIds = rows.map((r) => String(r["Internal ID"]));
    const parents = allData.filter((r) => {
      const isSelected = selectedIds.includes(String(r["Internal ID"]));
      const parentId = String(r["parent internal  id"] || "");
      const isChildOfSelected = allData.some(
        (p) =>
          selectedIds.includes(String(p["Internal ID"])) &&
          String(p["Internal ID"]) === parentId
      );
      return isSelected && !isChildOfSelected;
    });

    const children = allData.filter((r) =>
      parents.some(
        (p) => String(r["parent internal  id"]) === String(p["Internal ID"])
      )
    );

    if (parents.length === 0) {
      return res.json({
        success: true,
        results: [],
        message: "No matching parent rows in JSON",
      });
    }

    const api = getWooApi(env);
    const results = [];
    const payloads = []; // Store Woo payloads (debug)

    for (const parent of parents) {
      const internalId = parent["Internal ID"];

      // NOTE: We no longer skip purely due to connectorId; we UPSERT by SKU.
      // Keeping connectorId around in case you want to store Woo IDs later.
      const connectorId = String(parent["Connector ID"] || "");
      const myChildren = children.filter(
        (c) => String(c["parent internal  id"]) === String(internalId)
      );
      const hasChildren = myChildren.length > 0;

      // ✅ Categories
      const catNames = String(parent["Category"] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const categoryIds = [];
      for (const name of catNames) {
        const id = await ensureCategory(api, name);
        if (id) categoryIds.push({ id });
      }

      // ✅ Build Product data
      const productData = {
        sku: `P-${String(internalId)}`,
        name: parent["Name"] || "Untitled",
        type: hasChildren ? "variable" : "simple",
        short_description: parent["Short Description"] || "",
        description: parent["Detailed Description"] || "",
        categories: categoryIds,
        manage_stock: !hasChildren,
        backorders: "no",
        status: "publish",
      };

      // ✅ Upload parent + gallery images
      const images = [];
      if (parent["Item Image"]) {
        const mainImg = await uploadImageToWoo(parent["Item Image"], 0, env);
        if (mainImg) images.push(mainImg);
      }

      const galleryFields = [
        "Catalogue Image Two",
        "Catalogue Image Three",
        "Catalogue Image Four",
        "Catalogue Image Five",
      ];

      for (let i = 0; i < galleryFields.length; i++) {
        const field = galleryFields[i];
        if (parent[field]) {
          const img = await uploadImageToWoo(parent[field], i + 1, env);
          if (img) images.push(img);
        }
      }

      if (images.length > 0) productData.images = images;

      // ✅ Tags
      if (parent["tags"]) {
        const tags = String(parent["tags"])
          .split(".")
          .map((t) => t.trim())
          .filter(Boolean);
        if (tags.length) productData.tags = tags.map((t) => ({ name: t }));
      }

      const parentAttributes = [];

      // ✅ Comfort attribute
      if (parent["Comfort"]) {
        const comfortId = await ensureAttribute(api, "Comfort");
        if (comfortId) {
          await ensureAttributeTerm(api, comfortId, String(parent["Comfort"]).trim());
          parentAttributes.push({
            id: comfortId,
            visible: true,
            variation: false,
            options: [String(parent["Comfort"]).trim()],
          });
        }
      }

      // ✅ Matrix attributes
      let matrixMeta = {};
      if (hasChildren) {
        matrixMeta = await buildGlobalMatrixMeta(api, myChildren);
        for (const [attrName, meta] of Object.entries(matrixMeta)) {
          parentAttributes.push({
            id: meta.id,
            visible: true,
            variation: true,
            options: meta.options,
          });
        }
      }
      if (parentAttributes.length) productData.attributes = parentAttributes;

      // =====================================================
      // ✅ UPSERT parent by SKU (PATCH if exists, else CREATE)
      // =====================================================
      const parentSku = productData.sku;
      let createdParent;

      try {
        const existing = await findProductBySku(api, parentSku);

        if (existing?.id) {
          const { data } = await api.put(`products/${existing.id}`, productData);
          createdParent = data;
          payloads.push({ parent_updated: data, connectorId });
          console.log(`♻️ Updated parent ${createdParent.id}: ${createdParent.name}`);
          results.push({
            id: internalId,
            action: "updated",
            wooId: createdParent.id,
            type: createdParent.type,
          });
        } else {
          const { data } = await api.post("products", productData);
          createdParent = data;
          payloads.push({ parent_created: data, connectorId });
          console.log(`✅ Created parent ${createdParent.id}: ${createdParent.name}`);
          results.push({
            id: internalId,
            action: "created",
            wooId: createdParent.id,
            type: createdParent.type,
          });
        }
      } catch (err) {
        console.error(
          "❌ [Woo] Upsert parent failed:",
          err?.response?.data || err.message,
          productData
        );
        results.push({
          id: internalId,
          action: "error",
          stage: "upsert_parent",
          error: err?.response?.data || err.message,
        });
        continue;
      }

      // =====================================================
      // ✅ UPSERT variations by SKU (PATCH if exists, else CREATE)
      // =====================================================
      if (hasChildren && createdParent?.id && createdParent.type === "variable") {
        for (const child of myChildren) {
          // Build variation attributes (must match meta)
          const variationAttrs = [];
          for (const [attrName, meta] of Object.entries(matrixMeta)) {
            const childKey = Object.keys(child).find(
              (k) =>
                k.startsWith("Matrix :") &&
                k.replace("Matrix :", "").trim() === attrName
            );
            const childVal = childKey ? String(child[childKey]).trim() : "";
            if (childVal) variationAttrs.push({ id: meta.id, option: childVal });
          }

          if (variationAttrs.length === 0) continue;

          let variationImage = null;
          if (child["Item Image"]) {
            variationImage = await uploadImageToWoo(child["Item Image"], 0, env);
          }

          const variationData = {
            sku: `V-${String(child["Internal ID"])}`,
            regular_price: String(child["Base Price"] || 0),
            manage_stock: true,
            backorders: "yes",
            attributes: variationAttrs,
            image: variationImage ? { id: variationImage.id } : undefined,
          };

          try {
            const existingVar = await findVariationBySku(
              api,
              createdParent.id,
              variationData.sku
            );

            if (existingVar?.id) {
              const { data: v } = await api.put(
                `products/${createdParent.id}/variations/${existingVar.id}`,
                variationData
              );
              payloads.push({ variation_updated: v });
              console.log(
                `   ♻️ Updated variation ${v.id} for ${createdParent.id} (${variationData.sku})`
              );
            } else {
              const { data: v } = await api.post(
                `products/${createdParent.id}/variations`,
                variationData
              );
              payloads.push({ variation_created: v });
              console.log(
                `   ➕ Created variation ${v.id} for ${createdParent.id} (${variationData.sku})`
              );
            }
          } catch (err) {
            console.error(
              "❌ [Woo] Upsert variation failed:",
              err?.response?.data || err.message,
              variationData
            );
            results.push({
              id: child["Internal ID"],
              parent: createdParent.id,
              action: "error",
              stage: "upsert_variation",
              error: err?.response?.data || err.message,
            });
          }
        }
      }
    }

    console.log("✅ Woo push completed");

    return res.json({
      success: true,
      message: "WooCommerce push completed successfully",
      results,
      payload: payloads,
    });
  } catch (err) {
    console.error("❌ Woo push error:", err?.response?.data || err);
    return res.status(500).json({
      success: false,
      error: err?.response?.data || err.message || String(err),
    });
  }
});

export default router;
