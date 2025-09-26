// promotionOffers.js
console.log("✅ promotionOffers.js loaded");

import { fieldMap } from "./fieldMap.js";

// promotionOffers.js

// Define both feeds
const SANDBOXjsonUrl =
  "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4074&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQWUGcZwJHNV7qBCq1DqRIZbQtRBHmXKiGQxDAyKqdmaE";

const PRODjsonUrl =
  "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4366&deploy=1&compid=7972741&ns-at=AAEJ7tMQqCYeQCBBjwivZ91jpyJ6LIWIv99NNwIbTU33C04dA9g";

// Pick environment (default Sandbox)
const environment = localStorage.getItem("environment") || "Sandbox";

// Resolve correct feed
const jsonUrl =
  environment.toLowerCase() === "production" ? PRODjsonUrl : SANDBOXjsonUrl;

let fullData = [];
let listCache = {};

// --- UTILS ---
async function getListOptions(field) {
  if (listCache[field.name]) return listCache[field.name];
  if (!field.jsonFeed) return [];
  try {
    const res = await fetch(field.jsonFeed);
    const data = await res.json();
    listCache[field.name] = data;
    return data;
  } catch (err) {
    console.error("Failed to fetch list options for", field.name, err);
    return [];
  }
}

// --- LOAD DATA ---
async function loadPromotionPage() {
  const container = document.getElementById("table-data");
  container.innerHTML = "<p>Loading product data…</p>";

  try {
    const res = await fetch(jsonUrl);
    fullData = await res.json();
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "promo-main";

    const sidebar = document.createElement("div");
    sidebar.className = "promo-sidebar";
    sidebar.innerHTML = `<h3>📂 Saved Promotions</h3><ul id="promo-list"></ul>`;

    const editor = document.createElement("div");
    editor.id = "promo-editor";

    wrapper.appendChild(sidebar);
    wrapper.appendChild(editor);
    container.appendChild(wrapper);

    renderPromotionUI(editor); // fresh editor
    loadPromotionList();       // populate sidebar
  } catch (err) {
    container.innerHTML = "<p style='color:red;'>❌ Failed to load product data</p>";
    console.error(err);
  }
}

// --- PROMOTION LIST ---
async function loadPromotionList() {
  try {
    const res = await fetch("/api/promotions"); // ✅ backend returns [{ name, path }]
    if (!res.ok) throw new Error("Failed to fetch promotions list");

    const files = await res.json();
    const list = document.getElementById("promo-list");
    list.innerHTML = "";

    files.forEach((file) => {
      const li = document.createElement("li");
      li.textContent = file.name;
      li.className = "promo-list-item";
      li.onclick = () => loadPromotion(file.name); // ✅ pass name only
      list.appendChild(li);
    });
  } catch (err) {
    console.error("❌ Failed to load promotions list", err);
  }
}

async function loadPromotion(name) {
  try {
    const res = await fetch(`/api/promotions/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error("Failed to load promotion");

    const data = await res.json();

    const editor = document.getElementById("promo-editor");
    editor.innerHTML = ""; // clear previous UI
    renderPromotionUI(editor, data); // rebuild with loaded data
  } catch (err) {
    console.error("❌ Failed to load promotion", err);
  }
}



// --- SERIALIZE PROMOTION ---
function collectPromotionData(wrapper) {
  const title = wrapper.querySelector(".promo-title-text")?.textContent
    || wrapper.querySelector(".promo-title-input")?.value
    || "untitled";

  const sections = [];
  wrapper.querySelectorAll(".promo-section").forEach((sectionEl) => {
    const sectionLabel = sectionEl.querySelector(".section-label")?.value || "";
    const sectionColor = sectionEl.style.backgroundColor || "";

    const rows = [];
    sectionEl.querySelectorAll(".promo-row").forEach((rowEl) => {
      rows.push({
        label: rowEl.querySelector(".row-label")?.value || "",
        discount: rowEl.querySelector(".discount-input")?.value || "",
        pos: rowEl.querySelector(".pos-input")?.value || "",
        discPos: rowEl.querySelector(".disc-pos-input")?.value || "",
        other: rowEl.querySelector(".other-input")?.value || "",
        filters: JSON.parse(rowEl.dataset.filters || "[]"),
      });
    });

    // ✅ Save color along with label and rows
    sections.push({ label: sectionLabel, color: sectionColor, rows });
  });

  return { title, sections, savedAt: new Date().toISOString() };
}


// --- SAVE HANDLER ---
async function savePromotion(wrapper) {
  const data = collectPromotionData(wrapper);
  const fileName = data.title.replace(/\s+/g, "_").toLowerCase();

  try {
    const res = await fetch("/api/savePromotion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName,
        content: JSON.stringify(data, null, 2),
      }),
    });

    const json = await res.json();
    if (res.ok) {
      alert(`✅ Promotion saved to GitHub as ${fileName}.json`);
      loadPromotionList();
    } else {
      console.error("Save failed:", json);
      alert("❌ Save failed: " + (json.error || "Unknown error"));
    }
  } catch (err) {
    console.error("Save error:", err);
    alert("❌ Save error — see console");
  }
}

// --- MAIN UI ---
function renderPromotionUI(container, data = null) {
  const wrapper = document.createElement("div");
  wrapper.className = "promo-wrapper";
  container.appendChild(wrapper);

  // Promotion Title
  const titleWrap = document.createElement("div");
  titleWrap.className = "promo-title-wrap";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "Enter promotion name...";
  titleInput.className = "promo-title-input";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.className = "btn primary";

  titleWrap.appendChild(titleInput);
  titleWrap.appendChild(saveBtn);
  wrapper.appendChild(titleWrap);

  // --- Save button logic ---
  saveBtn.onclick = () => {
    const value = titleInput.value.trim();
    if (!value) return alert("Please enter a promotion name");

    // Replace input with static title + action buttons
    titleWrap.innerHTML = `
      <h2 class="promo-title-text">${value}</h2>
      <button class="btn small edit-btn">✏️</button>
      <button class="btn small save-json-btn">💾 Save</button>
      <button class="btn small push-btn">📤 Push</button>
    `;

    // Edit title
    titleWrap.querySelector(".edit-btn").onclick = () => {
      titleWrap.innerHTML = "";
      titleWrap.appendChild(titleInput);
      titleWrap.appendChild(saveBtn);
    };

    // Save JSON to GitHub
    titleWrap.querySelector(".save-json-btn").onclick = () => savePromotion(wrapper);

    // Push to NetSuite via /push-promotion
    titleWrap.querySelector(".push-btn").onclick = async () => {
      const products = collectProductsForPush(wrapper);
      if (!products.length) {
        alert("❌ No products found to push.");
        return;
      }

      try {
        const res = await fetch("/push-promotion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: products }),
        });

        const json = await res.json();
        if (res.ok) {
          // ✅ save jobId so footer can track progress
          localStorage.setItem("lastJobId", json.jobId);
          checkFooterJobStatus();

          alert(
            `✅ Promotion push queued with ${products.length} product(s).\nJob ID: ${json.jobId}\nQueue Position: ${json.queuePos}/${json.queueTotal}`
          );
        } else {
          console.error("Push enqueue failed:", json);
          alert("❌ Push failed to enqueue: " + (json.error || "Unknown error"));
        }
      } catch (err) {
        console.error("Push enqueue error:", err);
        alert("❌ Push enqueue error — see console");
      }
    };
  };

  // --- Add Section button ---
  const addSectionBtn = document.createElement("button");
  addSectionBtn.textContent = "+ Add Section";
  addSectionBtn.className = "btn primary";
  addSectionBtn.onclick = () => createSection(wrapper);
  wrapper.appendChild(addSectionBtn);

  // --- Prefill if editing an existing promotion ---
  if (data) {
    if (data.title) {
      titleWrap.innerHTML = `
        <h2 class="promo-title-text">${data.title}</h2>
        <button class="btn small edit-btn">✏️</button>
        <button class="btn small save-json-btn">💾 Save</button>
        <button class="btn small push-btn">📤 Push</button>
      `;
      titleWrap.querySelector(".save-json-btn").onclick = () => savePromotion(wrapper);
      titleWrap.querySelector(".edit-btn").onclick = () => {
        titleWrap.innerHTML = "";
        titleWrap.appendChild(titleInput);
        titleWrap.appendChild(saveBtn);
      };
      titleWrap.querySelector(".push-btn").onclick = async () => {
        const products = collectProductsForPush(wrapper);
        if (!products.length) {
          alert("❌ No products found to push.");
          return;
        }
        try {
          const res = await fetch("/push-promotion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: products }),
          });
          const json = await res.json();
          if (res.ok) {
            localStorage.setItem("lastJobId", json.jobId);
            checkFooterJobStatus();

            alert(
              `✅ Promotion push queued with ${products.length} product(s).\nJob ID: ${json.jobId}\nQueue Position: ${json.queuePos}/${json.queueTotal}`
            );
          } else {
            console.error("Push enqueue failed:", json);
            alert("❌ Push failed to enqueue: " + (json.error || "Unknown error"));
          }
        } catch (err) {
          console.error("Push enqueue error:", err);
          alert("❌ Push enqueue error — see console");
        }
      };
    }

    // ✅ Restore saved sections with label + color
    (data.sections || []).forEach((sec) => {
      const section = createSection(wrapper, sec.label, sec.color || "");
      (sec.rows || []).forEach((row) => createRow(section, row));
    });
  }
}




// --- CREATE SECTION ---
function createSection(container, labelVal = "", colorVal = "") {
  const section = document.createElement("div");
  section.className = "promo-section";

  // Apply saved color if present
  if (colorVal) {
    section.style.backgroundColor = colorVal;
  }

  const header = document.createElement("div");
  header.className = "promo-section-header";

  const labelInput = document.createElement("input");
  labelInput.placeholder = "Section Label";
  labelInput.className = "text-input section-label";
  labelInput.value = labelVal;

  const addRowBtn = document.createElement("button");
  addRowBtn.textContent = "+ Add Row";
  addRowBtn.className = "btn";
  addRowBtn.onclick = () => createRow(section);

  // 🎨 Palette button
  const paletteBtn = document.createElement("button");
  paletteBtn.textContent = "🎨";
  paletteBtn.className = "btn small";
  paletteBtn.onclick = () => openColorModal(section);

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "❌";
  removeBtn.className = "btn small";
  removeBtn.onclick = () => section.remove();

  header.appendChild(labelInput);
  header.appendChild(addRowBtn);
  header.appendChild(paletteBtn);
  header.appendChild(removeBtn);

  section.appendChild(header);
  container.appendChild(section);

  return section;
}

// --- helper to preload list options for filters ---
async function preloadFilterOptions(filters) {
  for (const f of filters) {
    const field = fieldMap.find((fld) => fld.name === f.field);
    if (field && field.jsonFeed && !listCache[field.name]) {
      await getListOptions(field); // fills listCache
    }
  }
}

// --- COLOR MODAL ---
function openColorModal(section) {
  let modal = document.getElementById("promo-color-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "promo-color-modal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Pick Section Color</h3>
        <input type="color" id="section-color" />
        <div style="margin-top:15px; display:flex; justify-content:flex-end; gap:10px;">
          <button id="color-cancel" class="btn">Cancel</button>
          <button id="color-apply" class="btn primary">Apply</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  const colorInput = modal.querySelector("#section-color");
  const currentBg = section.style.backgroundColor;
  if (currentBg) colorInput.value = rgbToHex(currentBg);

  modal.classList.remove("hidden");

  modal.querySelector("#color-cancel").onclick = () =>
    modal.classList.add("hidden");

  modal.querySelector("#color-apply").onclick = () => {
    const hex = colorInput.value;
    // Add slight opacity (~20%) to chosen color
    section.style.backgroundColor = hex + "33";
    modal.classList.add("hidden");
  };
}

// --- Utility: convert rgb(...) to hex ---
function rgbToHex(rgb) {
  const result = rgb.match(/\d+/g);
  if (!result) return "#ffffff";
  return (
    "#" +
    result
      .slice(0, 3)
      .map((n) => parseInt(n).toString(16).padStart(2, "0"))
      .join("")
  );
}


// --- CREATE ROW ---
function createRow(section, rowData = null) {
  const row = document.createElement("div");
  row.className = "promo-row";

  const header = document.createElement("div");
  header.className = "promo-row-header";

  const label = document.createElement("input");
  label.placeholder = "Row Label";
  label.className = "text-input row-label";
  if (rowData?.label) label.value = rowData.label;

  const badge = document.createElement("span");
  badge.className = "filter-badge hidden";
  badge.textContent = "0 filters";

  const btnGroup = document.createElement("div");
  btnGroup.className = "row-btn-group";

  const settingsBtn = document.createElement("button");
  settingsBtn.textContent = "⚙ Settings";
  settingsBtn.className = "btn";
  settingsBtn.onclick = () => openSettingsModal(row, badge);

  const expandBtn = document.createElement("button");
  expandBtn.textContent = "▼ Expand";
  expandBtn.className = "btn";
  expandBtn.onclick = () => {
    toggleProducts(row); // toggle show/hide
    expandBtn.textContent = row.querySelector(".promo-products").classList.contains("hidden")
      ? "▼ Expand"
      : "▲ Collapse";
  };

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "❌";
  removeBtn.className = "btn small";
  removeBtn.onclick = () => row.remove();

  btnGroup.appendChild(settingsBtn);
  btnGroup.appendChild(expandBtn);
  btnGroup.appendChild(removeBtn);

  header.appendChild(label);
  header.appendChild(btnGroup);
  header.appendChild(badge);

  const content = document.createElement("div");
  content.className = "promo-row-content";

  // Discount %
  const discount = document.createElement("input");
  discount.type = "number";
  discount.placeholder = "Discount %";
  discount.className = "text-input discount-input";
  if (rowData?.discount) discount.value = rowData.discount;

  // Point of Sale
  const pos = document.createElement("input");
  pos.placeholder = "Point of Sale";
  pos.className = "text-input pos-input";
  if (rowData?.pos) pos.value = rowData.pos;

  // Disc Pos (NEW)
  const discPos = document.createElement("input");
  discPos.placeholder = "Disc Pos";
  discPos.className = "text-input disc-pos-input";
  if (rowData?.discPos) discPos.value = rowData.discPos;

  // Other (NEW)
  const other = document.createElement("input");
  other.placeholder = "Other";
  other.className = "text-input other-input";
  if (rowData?.other) other.value = rowData.other;

  content.appendChild(discount);
  content.appendChild(pos);
  content.appendChild(discPos);
  content.appendChild(other);

  const productList = document.createElement("div");
  productList.className = "promo-products hidden";

  // ✅ Restore saved filters
  if (rowData?.filters) {
    row.dataset.filters = JSON.stringify(rowData.filters);
    if (rowData.filters.length > 0) {
      badge.textContent = `${rowData.filters.length} filter${rowData.filters.length > 1 ? "s" : ""}`;
      badge.classList.remove("hidden");
    }

    // ✅ Preload list options and build product table in hidden mode
    preloadFilterOptions(rowData.filters).then(() => {
      toggleProducts(row, { preload: true });
    });
  }

  row.appendChild(header);
  row.appendChild(content);
  row.appendChild(productList);
  section.appendChild(row);

  return row;
}



// --- SETTINGS MODAL ---
function openSettingsModal(row, badge) {
  let modal = document.getElementById("promo-settings-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "promo-settings-modal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modal-content" style="max-width:950px;">
        <h3>Row Filters</h3>
        <table id="filter-table">
          <thead>
            <tr><th>Field</th><th>Value</th><th></th></tr>
          </thead>
          <tbody id="filter-tbody"></tbody>
        </table>
        <div style="margin-top:8px; display:flex; gap:10px;">
          <button id="add-filter" class="btn">+ Add Filter</button>
          <button id="preview-filters" class="btn primary">🔎 Preview</button>
        </div>

        <!-- Preview panel -->
        <div id="filter-preview" style="margin-top:15px; padding:10px; border:1px solid #ddd; border-radius:6px; background:#fafafa; max-height:320px; overflow:auto;">
          <em>⚠️ Click Preview to see matching products.</em>
        </div>

        <div class="modal-actions" style="margin-top:15px;">
          <button id="settings-cancel" class="btn">Cancel</button>
          <button id="settings-save" class="btn primary">Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  const tbody = modal.querySelector("#filter-tbody");
  const preview = modal.querySelector("#filter-preview");
  tbody.innerHTML = "";

  // --- addFilterRow (same as production)
  const addFilterRow = async (prefill = {}) => {
    const tr = document.createElement("tr");

    const fieldTd = document.createElement("td");
    const fieldSelect = document.createElement("select");
    fieldSelect.className = "text-input";
    fieldSelect.innerHTML = `<option value="">-- choose field --</option>`;
    fieldMap.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.name;
      opt.textContent = f.name;
      fieldSelect.appendChild(opt);
    });
    fieldTd.appendChild(fieldSelect);
    tr.appendChild(fieldTd);

    const valueTd = document.createElement("td");
    tr.appendChild(valueTd);

    const removeTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.className = "btn";
    removeBtn.onclick = () => tr.remove();
    removeTd.appendChild(removeBtn);
    tr.appendChild(removeTd);

    tbody.appendChild(tr);

    const renderValue = async () => {
      valueTd.innerHTML = "";
      const field = fieldMap.find((f) => f.name === fieldSelect.value);
      if (!field) return;

      if (field.fieldType === "List/Record") {
        const select = document.createElement("select");
        select.className = "text-input";
        const options = await getListOptions(field);
        options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt["Internal ID"];
          o.textContent = opt["Name"];
          select.appendChild(o);
        });
        valueTd.appendChild(select);

      } else if (field.fieldType === "multiple-select") {
        const wrapper = document.createElement("div");
        wrapper.style.display = "flex";
        wrapper.style.flexDirection = "column";
        wrapper.style.gap = "4px";

        const search = document.createElement("input");
        search.type = "text";
        search.placeholder = "Search options…";
        search.className = "text-input";

        const select = document.createElement("select");
        select.multiple = true;
        select.className = "text-input";

        const modeToggle = document.createElement("select");
        modeToggle.className = "text-input";
        ["any", "all"].forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m;
          opt.textContent = m.toUpperCase();
          modeToggle.appendChild(opt);
        });

        const options = await getListOptions(field);
        const renderOptions = (filter = "") => {
          select.innerHTML = "";
          options
            .filter((o) =>
              (o.Name || "").toLowerCase().includes(filter.toLowerCase())
            )
            .forEach((opt) => {
              const o = document.createElement("option");
              o.value = opt["Internal ID"];
              o.textContent = opt["Name"];
              select.appendChild(o);
            });
        };

        renderOptions();
        search.addEventListener("input", () => renderOptions(search.value));

        wrapper.appendChild(search);
        wrapper.appendChild(select);
        wrapper.appendChild(modeToggle);
        valueTd.appendChild(wrapper);

      } else if (field.fieldType === "Checkbox") {
        const select = document.createElement("select");
        select.className = "text-input";
        ["", "true", "false"].forEach((v) => {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = v || "All";
          select.appendChild(o);
        });
        valueTd.appendChild(select);

      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "text-input";
        valueTd.appendChild(input);
      }

      if (prefill.field && prefill.field === fieldSelect.value) {
        if (field.fieldType === "multiple-select") {
          const wrapper = valueTd.querySelector("div");
          const select = wrapper.querySelector("select[multiple]");
          const modeToggle = wrapper.querySelector("select:not([multiple])");
          if (prefill.mode) modeToggle.value = prefill.mode;
          if (Array.isArray(prefill.ids)) {
            Array.from(select.options).forEach((o) => {
              if (prefill.ids.includes(o.value)) o.selected = true;
            });
          }
        } else {
          const input = valueTd.querySelector("input, select");
          if (input && prefill.value) input.value = prefill.value;
        }
      }
    };

    fieldSelect.addEventListener("change", () => renderValue());
    if (prefill.field) {
      fieldSelect.value = prefill.field;
      renderValue();
    }
  };

  const existingFilters = JSON.parse(row.dataset.filters || "[]");
  if (existingFilters.length) {
    existingFilters.forEach((f) => addFilterRow(f));
  } else {
    addFilterRow();
  }

  modal.querySelector("#add-filter").onclick = () => addFilterRow();

  // --- PREVIEW button logic (uses toggleProducts-style matching) ---
  modal.querySelector("#preview-filters").onclick = () => {
    const filters = [];
    tbody.querySelectorAll("tr").forEach((tr) => {
      const field = tr.querySelector("select")?.value;
      const fieldDef = fieldMap.find((f) => f.name === field);
      if (!field) return;

      if (fieldDef?.fieldType === "multiple-select") {
        const wrapper = tr.querySelector("td:nth-child(2) div");
        const select = wrapper.querySelector("select[multiple]");
        const mode = wrapper.querySelector("select:not([multiple])")?.value || "any";
        if (select) {
          const ids = Array.from(select.selectedOptions).map((o) => o.value);
          filters.push({ field, ids, mode });
        }
      } else {
        let value = "";
        if (fieldDef?.fieldType === "List/Record" || fieldDef?.fieldType === "Checkbox") {
          const select = tr.querySelector("td:nth-child(2) select");
          if (select) value = select.value;
        } else {
          const input = tr.querySelector("td:nth-child(2) input");
          if (input) value = input.value;
        }
        if (value) filters.push({ field, value });
      }
    });

    if (!filters.length) {
      preview.innerHTML = "<em>⚠️ Add at least one filter to preview products.</em>";
      return;
    }

    const discountInput = row.querySelector(".discount-input");
    const discount = discountInput ? parseFloat(discountInput.value) || 0 : 0;

    const matched = fullData.filter((prod) =>
      filters.every((f) => {
        const field = fieldMap.find((fld) => fld.name === f.field);
        if (!field) return true;

        if (field.jsonFeed && (field.fieldType === "List/Record" || field.fieldType === "multiple-select")) {
          const options = listCache[field.name] || [];
          if (!options.length) return false;

          const prodVals = String(prod[f.field] || "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          const prodIds = prodVals
            .map((val) => {
              let match = options.find((opt) => (opt.Name || "").toLowerCase() === val);
              if (!match) {
                match = options.find((opt) => (opt.Name || "").toLowerCase().endsWith(val));
              }
              return match ? String(match["Internal ID"]) : null;
            })
            .filter(Boolean);

          const selectedIds = f.ids || (f.value ? [f.value] : []);
          if (!prodIds.length) return false;

          return f.mode === "all"
            ? selectedIds.every((id) => prodIds.includes(id))
            : selectedIds.some((id) => prodIds.includes(id));
        }

        if (field.fieldType === "Checkbox") {
          const val = String(prod[f.field]).toLowerCase();
          return f.value === "" || val === f.value.toLowerCase();
        }

        return String(prod[f.field] || "")
          .toLowerCase()
          .includes(String(f.value).toLowerCase());
      })
    );

    // --- Render table like expand panel ---
    let html = `<h4>Matching Products (${matched.length})</h4>`;
    if (!matched.length) {
      html += "<p>No products match filters.</p>";
    } else {
      html += `<table class="promo-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Base Price</th>
            <th>Sale Price</th>
            <th class="ref-col">Base + VAT</th>
            <th class="ref-col">Sale + VAT</th>
          </tr>
        </thead>
        <tbody>`;
      matched.slice(0, 25).forEach((prod) => {
        const base = parseFloat(prod["Base Price"]) || 0;
        const sale = base * (1 - discount / 100);
        const baseVAT = base * 1.2;
        const saleVAT = sale * 1.2;
        html += `<tr>
          <td>${prod.Name}</td>
          <td>${base.toFixed(2)}</td>
          <td>${sale.toFixed(2)}</td>
          <td class="ref-col">${baseVAT.toFixed(2)}</td>
          <td class="ref-col">${saleVAT.toFixed(2)}</td>
        </tr>`;
      });
      if (matched.length > 25) {
        html += `<tr><td colspan="5"><em>+ ${matched.length - 25} more…</em></td></tr>`;
      }
      html += `</tbody></table>`;
    }
    preview.innerHTML = html;
  };

  modal.querySelector("#settings-cancel").onclick = () =>
    modal.classList.add("hidden");

  modal.querySelector("#settings-save").onclick = () => {
    const filters = [];
    tbody.querySelectorAll("tr").forEach((tr) => {
      const field = tr.querySelector("select")?.value;
      const fieldDef = fieldMap.find((f) => f.name === field);
      if (!field) return;

      if (fieldDef?.fieldType === "multiple-select") {
        const wrapper = tr.querySelector("td:nth-child(2) div");
        const select = wrapper.querySelector("select[multiple]");
        const mode = wrapper.querySelector("select:not([multiple])")?.value || "any";
        if (select) {
          const ids = Array.from(select.selectedOptions).map((o) => o.value);
          filters.push({ field, ids, mode });
        }
      } else {
        let value = "";
        if (fieldDef?.fieldType === "List/Record" || fieldDef?.fieldType === "Checkbox") {
          const select = tr.querySelector("td:nth-child(2) select");
          if (select) value = select.value;
        } else {
          const input = tr.querySelector("td:nth-child(2) input");
          if (input) value = input.value;
        }
        if (value) filters.push({ field, value });
      }
    });

    row.dataset.filters = JSON.stringify(filters);
    if (filters.length > 0) {
      badge.textContent = `${filters.length} filter${filters.length > 1 ? "s" : ""}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
    modal.classList.add("hidden");
  };

  modal.classList.remove("hidden");
}



// --- EXPAND PRODUCTS ---
function toggleProducts(row, { preload = false } = {}) {
  const list = row.querySelector(".promo-products");

  // Collapse if user clicked expand and it's already visible
  if (!preload && !list.classList.contains("hidden")) {
    list.classList.add("hidden");
    return;
  }

  const filters = JSON.parse(row.dataset.filters || "[]");
  const discountInput = row.querySelector(".discount-input");
  const discount = discountInput ? parseFloat(discountInput.value) || 0 : 0;

  // --- Apply filters to products ---
  const matched = fullData.filter((prod) =>
    filters.every((f) => {
      const field = fieldMap.find((fld) => fld.name === f.field);
      if (!field) return true;

      // List/Record or multiple-select fields
      if (field.jsonFeed && (field.fieldType === "List/Record" || field.fieldType === "multiple-select")) {
        const options = listCache[field.name] || [];
        if (!options.length) return false;

        const prodVals = String(prod[f.field] || "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

        const prodIds = prodVals
          .map((val) => {
            let match = options.find((opt) => (opt.Name || "").toLowerCase() === val);
            if (!match) {
              match = options.find((opt) => (opt.Name || "").toLowerCase().endsWith(val));
            }
            return match ? String(match["Internal ID"]) : null;
          })
          .filter(Boolean);

        const selectedIds = f.ids || (f.value ? [f.value] : []);
        if (!prodIds.length) return false;

        return f.mode === "all"
          ? selectedIds.every((id) => prodIds.includes(id))
          : selectedIds.some((id) => prodIds.includes(id));
      }

      // Checkbox fields
      if (field.fieldType === "Checkbox") {
        const val = String(prod[f.field]).toLowerCase();
        return f.value === "" || val === f.value.toLowerCase();
      }

      // Free-text fallback
      return String(prod[f.field] || "")
        .toLowerCase()
        .includes(String(f.value).toLowerCase());
    })
  );

  // --- Build product list HTML ---
  let html = `<h4>Matching Products (${matched.length})</h4>`;
  if (matched.length === 0) {
    html += "<p>No products match filters.</p>";
  } else {
    html += `<table class="promo-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Base Price</th>
          <th>Sale Price</th>
          <th class="ref-col">Base + VAT</th>
          <th class="ref-col">Sale + VAT</th>
        </tr>
      </thead>
      <tbody>`;
    matched.forEach((prod) => {
      const base = parseFloat(prod["Base Price"]) || 0;
      const sale = base * (1 - discount / 100);
      const baseVAT = base * 1.2;
      const saleVAT = sale * 1.2;

      html += `<tr>
        <td>${prod.Name}</td>
        <td>${base.toFixed(2)}</td>
        <td>${sale.toFixed(2)}</td>
        <td class="ref-col">${baseVAT.toFixed(2)}</td>
        <td class="ref-col">${saleVAT.toFixed(2)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  // Always rebuild table
  list.innerHTML = html;

  // Show only if not preload
  if (!preload) {
    list.classList.remove("hidden");
  } else {
    list.classList.add("hidden");
  }
}

function collectProductsForPush(wrapper) {
  const products = [];

  wrapper.querySelectorAll(".promo-row").forEach((row) => {
    const filters = JSON.parse(row.dataset.filters || "[]");
    const discountInput = row.querySelector(".discount-input");
    const discount = discountInput ? parseFloat(discountInput.value) || 0 : 0;

    const matched = fullData.filter((prod) =>
      filters.every((f) => {
        const field = fieldMap.find((fld) => fld.name === f.field);
        if (!field) return true;

        // List/Record or multiple-select fields
        if (field.jsonFeed && (field.fieldType === "List/Record" || field.fieldType === "multiple-select")) {
          const options = listCache[field.name] || [];
          if (!options.length) return false;

          const prodVals = String(prod[f.field] || "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          const prodIds = prodVals
            .map((val) => {
              let match = options.find((opt) => (opt.Name || "").toLowerCase() === val);
              if (!match) {
                match = options.find((opt) => (opt.Name || "").toLowerCase().endsWith(val));
              }
              return match ? String(match["Internal ID"]) : null;
            })
            .filter(Boolean);

          const selectedIds = f.ids || (f.value ? [f.value] : []);
          if (!prodIds.length) return false;

          return f.mode === "all"
            ? selectedIds.every((id) => prodIds.includes(id))
            : selectedIds.some((id) => prodIds.includes(id));
        }

        // Checkbox
        if (field.fieldType === "Checkbox") {
          const val = String(prod[f.field]).toLowerCase();
          return f.value === "" || val === f.value.toLowerCase();
        }

        // Free-text fallback
        return String(prod[f.field] || "")
          .toLowerCase()
          .includes(String(f.value).toLowerCase());
      })
    );

    matched.forEach((prod) => {
      const base = parseFloat(prod["Base Price"]) || 0;
      const sale = base * (1 - discount / 100);

      // ✅ Only keep ID + Sale Price
      products.push({
        id: prod["Internal ID"],        // NetSuite Internal ID
        wooId: prod["Woo ID"],          // WooCommerce Product/Variation ID
        basePrice: base.toFixed(2),     // NetSuite Base Price
        salePrice: sale.toFixed(2),     // NetSuite/Woo Sale Price
      });

    });
  });

  return products;
}





// --- STYLES ---
const style = document.createElement("style");
style.textContent = `
  .promo-main { display:flex; gap:20px; }
  .promo-sidebar { width:220px; border-right:1px solid #ddd; padding:10px; }
  .promo-sidebar h3 { margin-top:0; }
.promo-list-item {
  cursor: pointer;
  padding: 4px;
  white-space: nowrap;       /* prevent wrapping */
  overflow: hidden;          /* hide overflow */
  text-overflow: ellipsis;   /* add … when too long */
  display: block;            /* required for ellipsis to work properly */
  max-width: 100%;           /* constrain to sidebar width */
}


  .promo-wrapper {
    max-width: 900px;
    margin: 30px auto;
  }
  .promo-title-wrap {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .promo-title-input {
    flex: 1;
    padding: 6px 10px;
    font-size: 1rem;
    border: 1px solid #bbb;
    border-radius: 6px;
  }
  .promo-title-text {
    font-size: 1.5rem;
    font-weight: 600;
  }
  .promo-section {
    border: 1px solid #ddd;
    padding: 20px;
    margin: 25px 0;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  }
  .promo-section-header {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
  }
  .promo-row {
    border: 1px solid #ccc;
    border-radius: 8px;
    background: #fff;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    overflow: hidden;
  }
  .promo-row-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f4f6f8;
    padding: 8px 12px;
    border-bottom: 1px solid #ddd;
  }
  .promo-row-content {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
  }
  .row-label {
    font-weight: 500;
    flex: 1;
  }
  .row-btn-group {
    display: flex;
    gap: 8px;
  }
  .filter-badge {
    font-size: 0.85rem;
    color: #fff;
    background: #2b7cff;
    padding: 2px 8px;
    border-radius: 12px;
    margin-left: 10px;
  }
  .promo-products {
    margin: 10px;
    padding: 8px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
  }
  .promo-table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 6px;
  }
  .promo-table th, .promo-table td {
    border: 1px solid #ddd;
    padding: 6px;
    text-align: left;
  }
  .promo-table th.ref-col,
  .promo-table td.ref-col {
    color: #888;
  }
  .btn {
    padding: 6px 10px;
    border: 1px solid #aaa;
    border-radius: 4px;
    cursor: pointer;
    background: #f9f9f9;
    transition: background 0.2s;
  }
  .btn:hover {
    background: #eee;
  }
  .btn.primary {
    background: #2b7cff;
    color: #fff;
    border-color: #2b7cff;
  }
  .btn.primary:hover {
    background: #1a5fd4;
  }
  .btn.small {
    padding: 4px 6px;
    font-size: 0.85rem;
  }
  .text-input {
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .hidden { display:none; }
  .modal { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:999; }
  .modal.hidden { display:none; }
  .modal-content { background:#fff; padding:20px; border-radius:8px; min-width:400px; max-height:80vh; overflow:auto; }
  .modal-actions { margin-top:10px; display:flex; justify-content:flex-end; gap:10px; }
`;
document.head.appendChild(style);

// --- BOOTSTRAP ---
window.addEventListener("DOMContentLoaded", loadPromotionPage);
