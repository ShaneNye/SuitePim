console.log("fab Colours linked");

const netSuiteFabColsUrl =
  "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4519&deploy=1&compid=7972741&ns-at=AAEJ7tMQx1il7XmlrmBP3OnEFOcOaQ3fBQP5LRSYMiDumyAXS4c";

const netSuiteFabricRangesUrl =
  "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4520&deploy=1&compid=7972741&ns-at=AAEJ7tMQ2f-LDPHCCAUbbPU7KcFL_CkiKkJRSU_OM9JLqpAZTQY";

const netSuiteItemsUrl =
  "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4349&deploy=1&compid=7972741&ns-at=AAEJ7tMQJry3Xg_bYRGo6Nb9K7z8_2rleWv3_ujrUWhzaxks0Io";

let fullFabricData = [];
let filteredFabricData = [];
let fabricRangeOptions = [];
let allItemOptions = [];
let currentSelectedRecord = null;

let activeSyncJobs = [];
let syncPollTimer = null;
let currentPanelJobId = null;

document.addEventListener("DOMContentLoaded", async () => {
  initialiseCreateMenu();
  ensureQueuePanel();
  await restoreFabricSyncJobs();
  await loadFabricColours();

  const searchInput = document.getElementById("fabric-search");
  if (searchInput) {
    searchInput.addEventListener("input", handleSearch);
  }
});

async function restoreFabricSyncJobs() {
  try {
    const res = await fetch("/api/fabric-records/jobs");
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.success === false || !Array.isArray(data?.jobs)) {
      return;
    }

    activeSyncJobs = data.jobs;

    if (!currentPanelJobId && activeSyncJobs.length) {
      const firstRunning = activeSyncJobs.find(
        (job) => job.status !== "completed" && job.status !== "error"
      );
      currentPanelJobId = firstRunning?.jobId || activeSyncJobs[0].jobId;
    }

    renderQueuePanel();
    renderCurrentPanelStatus();

    const hasActiveJobs = activeSyncJobs.some(
      (job) => job.status !== "completed" && job.status !== "error"
    );

    if (hasActiveJobs) {
      startSyncPolling();
    }
  } catch (err) {
    console.error("Failed to restore fabric sync jobs:", err);
  }
}

async function loadFabricColours(selectRecordId = null) {
  const listEl = document.getElementById("fabric-list");
  const mainEl = document.getElementById("fabric-main");

  try {
    listEl.innerHTML = `<li class="loading-state">Loading records...</li>`;

    const [colourRes, fabricRes, itemRes] = await Promise.all([
      fetch(netSuiteFabColsUrl),
      fetch(netSuiteFabricRangesUrl),
      fetch(netSuiteItemsUrl),
    ]);

    if (!colourRes.ok) throw new Error(`Colour feed failed: HTTP ${colourRes.status}`);
    if (!fabricRes.ok) throw new Error(`Fabric feed failed: HTTP ${fabricRes.status}`);
    if (!itemRes.ok) throw new Error(`Item feed failed: HTTP ${itemRes.status}`);

    const colourData = await colourRes.json();
    const fabricData = await fabricRes.json();
    const itemData = await itemRes.json();

    if (!Array.isArray(colourData)) throw new Error("Colour feed did not return an array");
    if (!Array.isArray(fabricData)) throw new Error("Fabric feed did not return an array");
    if (!Array.isArray(itemData)) throw new Error("Item feed did not return an array");

    fabricRangeOptions = fabricData
      .map((row) => ({
        internalid: String(row["Internal ID"] || row.internalid || row.id || "").trim(),
        name: String(row["Name"] || row.name || "").trim(),
      }))
      .filter((row) => row.internalid || row.name);

    allItemOptions = itemData
      .filter((row) => {
        const isParent =
          row["Is Parent"] ??
          row.isParent ??
          row.isparent ??
          row["is parent"] ??
          null;

        return isParent !== null && isParent !== "";
      })
      .map((row) => ({
        internalid: String(row["Internal ID"] || row.internalid || row.id || "").trim(),
        name: String(row["Name"] || row.name || row.itemid || "").trim(),
      }))
      .filter((row) => row.internalid && row.name);

    fullFabricData = colourData.map((row) => {
      const internalid =
        row.internalid ||
        row.InternalID ||
        row["Internal ID"] ||
        "";

      const colourName =
        row.custrecord_sb_epos_fab_colours ||
        row.name ||
        row.Name ||
        "";

      const fabricRaw =
        row.custrecord_sb_epos_parent_fab_text ||
        row.custrecord_sb_epos_parent_fab_name ||
        row.custrecord_sb_epos_parent_fab_text_display ||
        row.custrecord_sb_epos_parent_fab ||
        row.custrecord_sb_epos_fab_col_range_text ||
        row.custrecord_sb_epos_fab_col_range_name ||
        row.custrecord_sb_epos_fab_col_range_text_display ||
        row.custrecord_sb_epos_fab_col_range ||
        row.fabric ||
        row.Fabric ||
        "";

      const parsed = buildRecordShape({
        rawColour: colourName,
        rawFabric: fabricRaw,
      });

      const items = normaliseItemsValue(row.items || row.Items || row["Items"]);
      const enrichedItems = enrichItemsWithLookup(items);

      return {
        raw: row,
        internalid: String(internalid).trim(),
        colour: parsed.colour,
        fabric: parsed.fabric,
        displayName: parsed.displayName,
        items: enrichedItems,
      };
    });

    filteredFabricData = [...fullFabricData];
    renderFabricList(filteredFabricData);

    if (filteredFabricData.length > 0) {
      let selected = selectRecordId
        ? filteredFabricData.find((r) => String(r.internalid) === String(selectRecordId))
        : null;

      if (!selected) selected = filteredFabricData[0];

      currentSelectedRecord = selected;
      renderFabricDetail(currentSelectedRecord);
      setActiveListItem(currentSelectedRecord.internalid);
    } else {
      currentSelectedRecord = null;
      listEl.innerHTML = `<li class="empty-state">No records found.</li>`;
      mainEl.innerHTML = `
        <h2>Fabric Colours</h2>
        <p>No data returned from the JSON feed.</p>
      `;
    }
  } catch (error) {
    console.error("Failed to load fabric colours:", error);

    listEl.innerHTML = `<li class="error-state">❌ Failed to load records.</li>`;
    mainEl.innerHTML = `
      <h2>Fabric Colours</h2>
      <p class="error-state">Failed to load data: ${escapeHtml(error.message)}</p>
    `;
  }
}

function ensureQueuePanel() {
  const sidebar = document.querySelector(".fabric-sidebar");
  if (!sidebar) return;

  let panel = document.getElementById("fabric-queue-panel");
  if (panel) return;

  panel = document.createElement("div");
  panel.id = "fabric-queue-panel";
  panel.style.borderTop = "1px solid #eee";
  panel.style.padding = "14px 16px";
  panel.style.background = "#fafafa";
  panel.innerHTML = `
    <h3 style="margin:0 0 10px 0; font-size:1rem;">In Progress / Queue</h3>
    <div id="fabric-queue-list">
      <p class="fabric-muted" style="margin:0;">No saves in progress.</p>
    </div>
  `;
  sidebar.appendChild(panel);
}

function initialiseCreateMenu() {
  const newColourBtn = document.getElementById("new-colour-btn");
  const toggleBtn = document.getElementById("fabric-create-toggle");
  const menu = document.getElementById("fabric-create-menu");
  const menuNewColour = document.getElementById("menu-new-colour");
  const menuNewFabric = document.getElementById("menu-new-fabric");

  if (!newColourBtn || !toggleBtn || !menu || !menuNewColour || !menuNewFabric) {
    return;
  }

  let currentCreateMode = "colour";

  function syncPrimaryButtonLabel() {
    newColourBtn.textContent = currentCreateMode === "fabric" ? "New Fabric" : "New Colour";
  }

  newColourBtn.addEventListener("click", () => {
    menu.classList.add("hidden");
    clearActiveListItem();

    if (currentCreateMode === "fabric") {
      renderNewFabricForm();
    } else {
      renderNewColourForm();
    }
  });

  toggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.classList.toggle("hidden");
  });

  menuNewColour.addEventListener("click", () => {
    currentCreateMode = "colour";
    syncPrimaryButtonLabel();
    menu.classList.add("hidden");
  });

  menuNewFabric.addEventListener("click", () => {
    currentCreateMode = "fabric";
    syncPrimaryButtonLabel();
    menu.classList.add("hidden");
  });

  document.addEventListener("click", (event) => {
    const splitWrap = toggleBtn.closest(".fabric-split-btn");
    if (splitWrap && !splitWrap.contains(event.target)) {
      menu.classList.add("hidden");
    }
  });

  syncPrimaryButtonLabel();
}

function buildRecordShape({ rawColour, rawFabric }) {
  const colour = String(rawColour || "").trim();
  let fabric = String(rawFabric || "").trim();

  if (!fabric && colour.includes("|")) {
    const [left, right] = colour.split("|");
    fabric = String(left || "").trim();
    return {
      fabric,
      colour: String(right || "").trim(),
      displayName: colour,
    };
  }

  return {
    fabric,
    colour,
    displayName: fabric ? `${fabric}|${colour}` : colour,
  };
}

function normaliseItemsValue(itemsValue) {
  if (!itemsValue) return [];

  if (Array.isArray(itemsValue)) {
    return itemsValue
      .map((item) => {
        if (typeof item === "string") {
          const trimmed = item.trim();
          return trimmed ? { id: "", name: trimmed } : null;
        }

        if (item && typeof item === "object") {
          return {
            id: String(item.internalid || item.id || item["Internal ID"] || "").trim(),
            name: String(item.name || item.Name || item.itemid || item.text || "").trim(),
          };
        }

        return null;
      })
      .filter((item) => item && (item.id || item.name));
  }

  if (typeof itemsValue === "string") {
    return itemsValue
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((value) => {
        const exactById = allItemOptions.find((opt) => String(opt.internalid) === value);
        if (exactById) return { id: exactById.internalid, name: exactById.name };
        return { id: "", name: value };
      });
  }

  return [];
}

function enrichItemsWithLookup(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const id = String(item.id || item.internalid || "").trim();
      const name = String(item.name || "").trim();

      if (id) {
        const matchById = allItemOptions.find((opt) => String(opt.internalid) === id);
        return {
          internalid: id,
          name: matchById?.name || name || id,
        };
      }

      if (name) {
        const matchByName = allItemOptions.find(
          (opt) => String(opt.name).trim().toLowerCase() === name.toLowerCase()
        );
        return {
          internalid: matchByName?.internalid || "",
          name: matchByName?.name || name,
        };
      }

      return null;
    })
    .filter(Boolean);
}

function renderItemsTable(items, opts = {}) {
  const editable = !!opts.editable;
  const tableId = opts.tableId || "fabric-items-table";
  const searchId = opts.searchId || "fabric-item-search";
  const resultsId = opts.resultsId || "fabric-item-search-results";
  const addBtnId = opts.addBtnId || "fabric-item-add-btn";

  const safeItems = Array.isArray(items) ? items : [];

  const rowsHtml = safeItems.length
    ? safeItems
        .map((item, index) => {
          return `
            <tr data-row-index="${index}">
              <td style="padding:10px; border-bottom:1px solid #eee;">${escapeHtml(item.internalid || "")}</td>
              <td style="padding:10px; border-bottom:1px solid #eee;">${escapeHtml(item.name || "")}</td>
              ${
                editable
                  ? `<td style="padding:10px; border-bottom:1px solid #eee;">
                      <button type="button" class="fabric-btn-secondary fabric-remove-item-btn" data-row-index="${index}">
                        Remove
                      </button>
                    </td>`
                  : ""
              }
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="${editable ? 3 : 2}" style="padding:10px; color:#666;">No linked items found.</td>
      </tr>
    `;

  return `
    <div style="margin-top:24px;">
      <h3 style="margin:0 0 12px 0;">Items Using This Colour</h3>
      <p>Items listed are the parent item records. Any items removed or added to this list - any child records will also be updated.</p>

      ${
        editable
          ? `
            <div style="position:relative; margin-bottom:12px;">
              <div style="display:grid; grid-template-columns: 1fr auto; gap:8px;">
                <input
                  id="${searchId}"
                  type="text"
                  class="fabric-form-control"
                  placeholder="Search item by name or internal ID..."
                  autocomplete="off"
                >
                <button id="${addBtnId}" type="button" class="fabric-btn-primary" disabled>Add</button>
              </div>
              <div
                id="${resultsId}"
                style="
                  display:none;
                  position:absolute;
                  top:100%;
                  left:0;
                  right:0;
                  z-index:30;
                  background:#fff;
                  border:1px solid #ddd;
                  border-radius:8px;
                  box-shadow:0 8px 20px rgba(0,0,0,0.12);
                  max-height:240px;
                  overflow:auto;
                  margin-top:6px;
                "
              ></div>
            </div>
          `
          : ""
      }

      <div style="overflow-x:auto;">
        <table id="${tableId}" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ddd;">Internal ID</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ddd;">Name</th>
              ${
                editable
                  ? `<th style="text-align:left; padding:10px; border-bottom:1px solid #ddd;">Action</th>`
                  : ""
              }
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function attachEditableItemsTable({ containerId, items }) {
  const searchInput = document.getElementById("fabric-item-search");
  const resultsEl = document.getElementById("fabric-item-search-results");
  const addBtn = document.getElementById("fabric-item-add-btn");
  const tableBody = document.querySelector("#fabric-items-table tbody");
  const container = document.getElementById(containerId);

  if (!container || !searchInput || !resultsEl || !addBtn || !tableBody) return;

  let workingItems = Array.isArray(items) ? [...items] : [];
  let selectedCandidate = null;

  function itemExists(candidate) {
    return workingItems.some(
      (item) => String(item.internalid) === String(candidate.internalid)
    );
  }

  function renderTableRows() {
    container.dataset.items = JSON.stringify(workingItems);

    if (!workingItems.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="3" style="padding:10px; color:#666;">No linked items found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = workingItems
      .map((item, index) => {
        return `
          <tr data-row-index="${index}">
            <td style="padding:10px; border-bottom:1px solid #eee;">${escapeHtml(item.internalid || "")}</td>
            <td style="padding:10px; border-bottom:1px solid #eee;">${escapeHtml(item.name || "")}</td>
            <td style="padding:10px; border-bottom:1px solid #eee;">
              <button type="button" class="fabric-btn-secondary fabric-remove-item-btn" data-row-index="${index}">
                Remove
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    tableBody.querySelectorAll(".fabric-remove-item-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.rowIndex);
        workingItems.splice(idx, 1);
        renderTableRows();
      });
    });
  }

  function hideResults() {
    resultsEl.style.display = "none";
    resultsEl.innerHTML = "";
  }

  function showResults(matches) {
    if (!matches.length) {
      resultsEl.innerHTML = `
        <div style="padding:10px 12px; color:#666;">No items found.</div>
      `;
      resultsEl.style.display = "block";
      return;
    }

    resultsEl.innerHTML = matches
      .map((item) => {
        const disabled = itemExists(item);
        return `
          <button
            type="button"
            class="fabric-item-result"
            data-id="${escapeHtml(item.internalid)}"
            style="
              display:block;
              width:100%;
              text-align:left;
              padding:10px 12px;
              border:none;
              border-bottom:1px solid #eee;
              background:${disabled ? "#f9f9f9" : "#fff"};
              color:${disabled ? "#999" : "#222"};
              cursor:${disabled ? "not-allowed" : "pointer"};
            "
            ${disabled ? "disabled" : ""}
          >
            <div><strong>${escapeHtml(item.name)}</strong></div>
            <div style="font-size:12px; color:#666;">Internal ID: ${escapeHtml(item.internalid)}</div>
          </button>
        `;
      })
      .join("");

    resultsEl.style.display = "block";

    resultsEl.querySelectorAll(".fabric-item-result").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = String(btn.dataset.id);
        const candidate = allItemOptions.find((opt) => String(opt.internalid) === id);
        if (!candidate) return;

        selectedCandidate = {
          internalid: candidate.internalid,
          name: candidate.name,
        };

        searchInput.value = `${candidate.name} (${candidate.internalid})`;
        addBtn.disabled = false;
        hideResults();
      });
    });
  }

  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    selectedCandidate = null;
    addBtn.disabled = true;

    if (!term) {
      hideResults();
      return;
    }

    const matches = allItemOptions
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(term) ||
          item.internalid.toLowerCase().includes(term)
        );
      })
      .slice(0, 20);

    showResults(matches);
  });

  searchInput.addEventListener("focus", () => {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) return;

    const matches = allItemOptions
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(term) ||
          item.internalid.toLowerCase().includes(term)
        );
      })
      .slice(0, 20);

    showResults(matches);
  });

  addBtn.addEventListener("click", () => {
    if (!selectedCandidate) return;
    if (itemExists(selectedCandidate)) return;

    workingItems.push({
      internalid: selectedCandidate.internalid,
      name: selectedCandidate.name,
    });

    selectedCandidate = null;
    searchInput.value = "";
    addBtn.disabled = true;
    hideResults();
    renderTableRows();
  });

  document.addEventListener("click", (event) => {
    if (event.target !== searchInput && !resultsEl.contains(event.target)) {
      hideResults();
    }
  });

  renderTableRows();
}

function getEditableItemsFromDom(containerId = "fabric-items-editor") {
  const container = document.getElementById(containerId);
  if (!container) return [];

  try {
    const parsed = JSON.parse(container.dataset.items || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getOriginalItemsFromDom(containerId = "fabric-items-editor") {
  const container = document.getElementById(containerId);
  if (!container) return [];

  try {
    const parsed = JSON.parse(container.dataset.originalItems || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderFabricList(data) {
  const listEl = document.getElementById("fabric-list");

  if (!data.length) {
    listEl.innerHTML = `<li class="empty-state">No matching records.</li>`;
    return;
  }

  listEl.innerHTML = "";

  data.forEach((item) => {
    const li = document.createElement("li");
    li.className = "fabric-list-item";
    li.dataset.id = item.internalid;

    li.innerHTML = `
      <div class="fabric-item-name">${escapeHtml(item.displayName || item.colour)}</div>
      <div class="fabric-item-meta">
        ${item.fabric ? `Fabric: ${escapeHtml(item.fabric)}` : `Standalone Colour`}
      </div>
    `;

    li.addEventListener("click", () => {
      currentSelectedRecord = item;
      currentPanelJobId = getLatestJobIdForLabel(item.displayName);
      renderFabricDetail(item);
      setActiveListItem(item.internalid);
    });

    listEl.appendChild(li);
  });
}

function renderFabricDetail(item) {
  const mainEl = document.getElementById("fabric-main");
  const statusHtml = renderCurrentPanelStatus();

  mainEl.innerHTML = `
    <div class="fabric-detail-header">
      <div>
        <h2 style="margin:0;">Fabric Colour Record</h2>
        <p style="margin:6px 0 0 0;" class="fabric-muted">Internal ID: ${escapeHtml(item.internalid)}</p>
      </div>
      <button id="edit-fabric-record-btn" class="fabric-btn-primary" type="button">
        Edit
      </button>
    </div>

    <div class="fabric-detail-grid">
      <div><strong>Colour</strong></div>
      <div>${escapeHtml(item.colour || "")}</div>

      <div><strong>Fabric</strong></div>
      <div>${escapeHtml(item.fabric || "")}</div>
    </div>

    ${renderItemsTable(item.items)}
    ${statusHtml}
  `;

  const editBtn = document.getElementById("edit-fabric-record-btn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      renderFabricEditForm(item);
    });
  }
}

function renderFabricEditForm(item) {
  const mainEl = document.getElementById("fabric-main");
  const selectedFabricId = getFabricIdByName(item.fabric);
  const statusHtml = renderCurrentPanelStatus();

  const fabricOptionsHtml = [
    `<option value="">-- Select Fabric --</option>`,
    ...fabricRangeOptions.map((option) => {
      const selected = String(option.internalid) === String(selectedFabricId) ? "selected" : "";
      return `
        <option value="${escapeHtml(option.name)}" data-id="${escapeHtml(option.internalid)}" ${selected}>
          ${escapeHtml(option.name)}
        </option>
      `;
    }),
  ].join("");

  mainEl.innerHTML = `
    <div class="fabric-detail-header">
      <div>
        <h2 style="margin:0;">Edit Fabric Colour Record</h2>
        <p style="margin:6px 0 0 0;" class="fabric-muted">Internal ID: ${escapeHtml(item.internalid)}</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button id="save-fabric-edit-btn" class="fabric-btn-primary" type="button">
          Save
        </button>
        <button id="cancel-fabric-edit-btn" class="fabric-btn-secondary" type="button">
          Cancel
        </button>
      </div>
    </div>

    <div class="fabric-detail-grid">
      <div><strong>Colour</strong></div>
      <div>
        <input
          id="fabric-colour-input"
          type="text"
          value="${escapeHtml(item.colour || "")}"
          class="fabric-form-control"
        >
      </div>

      <div><strong>Fabric</strong></div>
      <div>
        <select
          id="fabric-range-select"
          class="fabric-form-control fabric-select"
        >
          ${fabricOptionsHtml}
        </select>
      </div>
    </div>

    <div
      id="fabric-items-editor"
      data-items='${escapeHtml(JSON.stringify(item.items || []))}'
      data-original-items='${escapeHtml(JSON.stringify(item.items || []))}'
    >
      ${renderItemsTable(item.items, { editable: true })}
    </div>

    ${statusHtml}
    <div id="fabric-form-message" style="margin-top:16px;"></div>
  `;

  attachEditableItemsTable({
    containerId: "fabric-items-editor",
    items: item.items || [],
  });

  const cancelBtn = document.getElementById("cancel-fabric-edit-btn");
  const saveBtn = document.getElementById("save-fabric-edit-btn");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      renderFabricDetail(item);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const colourInput = document.getElementById("fabric-colour-input");
      const fabricSelect = document.getElementById("fabric-range-select");

      const colour = colourInput?.value.trim() || "";
      const fabricId = fabricSelect?.selectedOptions?.[0]?.dataset?.id || "";
      const linkedItems = getEditableItemsFromDom("fabric-items-editor");
      const originalItems = getOriginalItemsFromDom("fabric-items-editor");

      if (!colour) {
        setFormMessage("fabric-form-message", "Please enter a colour.", true);
        return;
      }

      await saveFabricRecord({
        button: saveBtn,
        messageId: "fabric-form-message",
        payload: {
          recordType: "fabricColour",
          action: "update",
          id: item.internalid,
          colour,
          fabricId,
        },
        syncMeta: {
          label: buildFabricColourLabel(item.fabric || getFabricNameById(fabricId), colour),
          items: linkedItems,
          originalItems,
        },
        onSuccess: async (saveData) => {
          setFormMessage("fabric-form-message", "Fabric colour record saved. Item sync queued.");
          await loadFabricColours(item.internalid);

          const savedId = String(saveData?.result?.id || item.internalid || "");
          await queueFabricSync({
            fabricColourId: savedId,
            label: buildFabricColourLabel(item.fabric || getFabricNameById(fabricId), colour),
            items: linkedItems,
            originalItems,
          });
        },
      });
    });
  }
}

function renderNewColourForm() {
  const mainEl = document.getElementById("fabric-main");

  const fabricOptionsHtml = [
    `<option value="">-- Select Fabric --</option>`,
    ...fabricRangeOptions.map((option) => `
      <option value="${escapeHtml(option.name)}" data-id="${escapeHtml(option.internalid)}">
        ${escapeHtml(option.name)}
      </option>
    `),
  ].join("");

  mainEl.innerHTML = `
    <div class="fabric-detail-header">
      <div>
        <h2 style="margin:0;">New Colour Record</h2>
        <p style="margin:6px 0 0 0;" class="fabric-muted">Internal ID: To Be Generated</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button id="save-new-record-btn" class="fabric-btn-primary" type="button">
          Save
        </button>
        <button id="cancel-new-record-btn" class="fabric-btn-secondary" type="button">
          Cancel
        </button>
      </div>
    </div>

    <div class="fabric-detail-grid">
      <div><strong>Colour</strong></div>
      <div>
        <input
          id="new-fabric-colour-input"
          type="text"
          value=""
          class="fabric-form-control"
          placeholder="Enter colour"
        >
      </div>

      <div><strong>Fabric</strong></div>
      <div>
        <select
          id="new-fabric-range-select"
          class="fabric-form-control fabric-select"
        >
          ${fabricOptionsHtml}
        </select>
      </div>
    </div>

    <div
      id="fabric-items-editor"
      data-items='[]'
      data-original-items='[]'
    >
      ${renderItemsTable([], { editable: true })}
    </div>

    ${renderCurrentPanelStatus()}
    <div id="fabric-form-message" style="margin-top:16px;"></div>
  `;

  attachEditableItemsTable({
    containerId: "fabric-items-editor",
    items: [],
  });

  const cancelBtn = document.getElementById("cancel-new-record-btn");
  const saveBtn = document.getElementById("save-new-record-btn");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (currentSelectedRecord) {
        renderFabricDetail(currentSelectedRecord);
        setActiveListItem(currentSelectedRecord.internalid);
      } else {
        renderEmptyMainPanel();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const colourInput = document.getElementById("new-fabric-colour-input");
      const fabricSelect = document.getElementById("new-fabric-range-select");

      const colour = colourInput?.value.trim() || "";
      const fabricId = fabricSelect?.selectedOptions?.[0]?.dataset?.id || "";
      const linkedItems = getEditableItemsFromDom("fabric-items-editor");
      const fabricName = getFabricNameById(fabricId);
      const label = buildFabricColourLabel(fabricName, colour);

      if (!colour) {
        setFormMessage("fabric-form-message", "Please enter a colour.", true);
        return;
      }

      await saveFabricRecord({
        button: saveBtn,
        messageId: "fabric-form-message",
        payload: {
          recordType: "fabricColour",
          action: "create",
          colour,
          fabricId,
        },
        syncMeta: {
          label,
          items: linkedItems,
          originalItems: [],
        },
        onSuccess: async (saveData) => {
          setFormMessage("fabric-form-message", "Fabric colour record saved. Item sync queued.");
          await loadFabricColours();

          const savedId = String(saveData?.result?.id || "");
          await queueFabricSync({
            fabricColourId: savedId,
            label,
            items: linkedItems,
            originalItems: [],
          });
        },
      });
    });
  }
}

function renderNewFabricForm() {
  const mainEl = document.getElementById("fabric-main");

  mainEl.innerHTML = `
    <div class="fabric-detail-header">
      <div>
        <h2 style="margin:0;">New Fabric Record</h2>
        <p style="margin:6px 0 0 0;" class="fabric-muted">Internal ID: To Be Generated</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button id="save-new-fabric-btn" class="fabric-btn-primary" type="button">
          Save
        </button>
        <button id="cancel-new-fabric-btn" class="fabric-btn-secondary" type="button">
          Cancel
        </button>
      </div>
    </div>

    <div class="fabric-detail-grid">
      <div><strong>Fabric</strong></div>
      <div>
        <input
          id="new-fabric-name-input"
          type="text"
          value=""
          class="fabric-form-control"
          placeholder="Enter fabric name"
        >
      </div>
    </div>

    <div id="fabric-form-message" style="margin-top:16px;"></div>
  `;

  const cancelBtn = document.getElementById("cancel-new-fabric-btn");
  const saveBtn = document.getElementById("save-new-fabric-btn");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (currentSelectedRecord) {
        renderFabricDetail(currentSelectedRecord);
        setActiveListItem(currentSelectedRecord.internalid);
      } else {
        renderEmptyMainPanel();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const fabricInput = document.getElementById("new-fabric-name-input");
      const name = fabricInput?.value.trim() || "";

      if (!name) {
        setFormMessage("fabric-form-message", "Please enter a fabric name.", true);
        return;
      }

      await saveFabricRecord({
        button: saveBtn,
        messageId: "fabric-form-message",
        payload: {
          recordType: "fabric",
          action: "create",
          name,
        },
        onSuccess: async () => {
          setFormMessage("fabric-form-message", "Fabric saved successfully.");
          await loadFabricColours();
        },
      });
    });
  }
}

async function saveFabricRecord({ button, messageId, payload, syncMeta, onSuccess }) {
  const originalText = button?.textContent || "Save";

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Saving...";
    }

    setFormMessage(messageId, "");

    const res = await fetch(`/api/fabric-records/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.success === false) {
      throw new Error(
        data?.message ||
        data?.error ||
        data?.details?.error ||
        "Save failed"
      );
    }

    if (typeof onSuccess === "function") {
      await onSuccess(data, syncMeta);
    }
  } catch (err) {
    console.error("Fabric save failed:", err);
    setFormMessage(messageId, err.message || "Save failed", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function queueFabricSync({ fabricColourId, label, items, originalItems }) {
  if (!fabricColourId) return;

  try {
    const res = await fetch(`/api/fabric-records/queue-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fabricColourId,
        label,
        items,
        originalItems,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.success === false) {
      throw new Error(data?.message || data?.error || "Failed to queue sync job");
    }

    const job = {
      jobId: data.jobId,
      label: label || `Fabric Colour ${fabricColourId}`,
      status: "pending",
      progressMessage: "Queued",
      queuePos: data.queuePos || 0,
      queueTotal: data.queueTotal || 0,
      processed: 0,
      total: 0,
    };

    currentPanelJobId = job.jobId;
    upsertSyncJob(job);
    startSyncPolling();

    renderCurrentPanelStatus();
    renderQueuePanel();
  } catch (err) {
    console.error("Failed to queue fabric sync:", err);
    setFormMessage("fabric-form-message", err.message || "Failed to queue sync", true);
  }
}

function upsertSyncJob(job) {
  const idx = activeSyncJobs.findIndex((j) => j.jobId === job.jobId);
  if (idx >= 0) {
    activeSyncJobs[idx] = { ...activeSyncJobs[idx], ...job };
  } else {
    activeSyncJobs.unshift(job);
  }

  activeSyncJobs = activeSyncJobs.slice(0, 12);
  renderQueuePanel();
}

function renderQueuePanel() {
  ensureQueuePanel();
  const listEl = document.getElementById("fabric-queue-list");
  if (!listEl) return;

  if (!activeSyncJobs.length) {
    listEl.innerHTML = `<p class="fabric-muted" style="margin:0;">No saves in progress.</p>`;
    return;
  }

  listEl.innerHTML = activeSyncJobs
    .map((job) => {
      const statusColour =
        job.status === "completed"
          ? "#166534"
          : job.status === "error"
          ? "#b91c1c"
          : "#1d4ed8";

      return `
        <div
          data-job-id="${escapeHtml(job.jobId)}"
          class="fabric-queue-item"
          style="
            padding:10px 12px;
            border:1px solid #e5e7eb;
            border-radius:8px;
            background:#fff;
            margin-bottom:8px;
            cursor:pointer;
          "
        >
          <div style="font-weight:600; color:#222;">${escapeHtml(job.label || job.jobId)}</div>
          <div style="font-size:12px; color:${statusColour}; margin-top:4px;">
            ${escapeHtml(job.progressMessage || job.status || "Queued")}
          </div>
          <div style="font-size:12px; color:#666; margin-top:2px;">
            ${escapeHtml((job.status || "").toUpperCase())}
            ${job.total ? ` • ${job.processed || 0}/${job.total}` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  listEl.querySelectorAll(".fabric-queue-item").forEach((el) => {
    el.addEventListener("click", () => {
      currentPanelJobId = el.dataset.jobId;
      renderCurrentPanelStatus();
    });
  });
}

function renderCurrentPanelStatus() {
  const job = activeSyncJobs.find((j) => j.jobId === currentPanelJobId);

  const html = job
    ? `
      <div id="fabric-live-status" style="margin-top:20px;">
        <h3 style="margin:0 0 10px 0;">Update Status</h3>
        <div style="padding:12px; border:1px solid #ddd; border-radius:8px; background:#fafafa;">
          <div style="font-weight:600; margin-bottom:6px;">${escapeHtml(job.label || "")}</div>
          <div style="margin-bottom:6px;">${escapeHtml(job.progressMessage || job.status || "Queued")}</div>
          <div class="fabric-muted">
            Status: ${escapeHtml(job.status || "pending")}
            ${job.total ? ` • ${job.processed || 0}/${job.total}` : ""}
          </div>
        </div>
      </div>
    `
    : `<div id="fabric-live-status"></div>`;

  const existing = document.getElementById("fabric-live-status");
  if (existing) {
    existing.outerHTML = html;
  }

  return html;
}

function startSyncPolling() {
  if (syncPollTimer) return;

  syncPollTimer = setInterval(async () => {
    if (!activeSyncJobs.length) {
      stopSyncPolling();
      return;
    }

    const idsToPoll = activeSyncJobs
      .filter((job) => job.status !== "completed" && job.status !== "error")
      .map((job) => job.jobId);

    if (!idsToPoll.length) {
      stopSyncPolling();
      return;
    }

    await Promise.all(idsToPoll.map(pollSyncJob));
    renderQueuePanel();
    renderCurrentPanelStatus();
  }, 2000);
}

function stopSyncPolling() {
  if (syncPollTimer) {
    clearInterval(syncPollTimer);
    syncPollTimer = null;
  }
}

async function pollSyncJob(jobId) {
  try {
    const res = await fetch(`/push-status/${jobId}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.success === false) return;

    upsertSyncJob({
      jobId,
      label: data.label,
      status: data.status,
      progressMessage: data.progressMessage,
      processed: data.processed,
      total: data.total,
      queuePos: data.queuePos,
      queueTotal: data.queueTotal,
    });
  } catch (err) {
    console.error(`Failed to poll sync job ${jobId}:`, err);
  }
}

function getLatestJobIdForLabel(label) {
  const match = activeSyncJobs.find((job) => job.label === label);
  return match ? match.jobId : null;
}

function buildFabricColourLabel(fabricName, colour) {
  const f = String(fabricName || "").trim();
  const c = String(colour || "").trim();
  return f ? `${f}|${c}` : c;
}

function getFabricNameById(id) {
  const match = fabricRangeOptions.find((opt) => String(opt.internalid) === String(id || ""));
  return match ? match.name : "";
}

function setFormMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (!message) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <div style="
      padding:10px 12px;
      border-radius:6px;
      border:1px solid ${isError ? "#ef4444" : "#22c55e"};
      background:${isError ? "#fef2f2" : "#f0fdf4"};
      color:${isError ? "#b91c1c" : "#166534"};
    ">
      ${escapeHtml(message)}
    </div>
  `;
}

function getFabricIdByName(name) {
  const match = fabricRangeOptions.find(
    (opt) => String(opt.name).trim().toLowerCase() === String(name || "").trim().toLowerCase()
  );
  return match ? match.internalid : "";
}

function renderEmptyMainPanel() {
  const mainEl = document.getElementById("fabric-main");
  mainEl.innerHTML = `
    <h2>Fabric Colours</h2>
    <p>Select a record from the left, or create a new one.</p>
    ${renderCurrentPanelStatus()}
  `;
}

function setActiveListItem(internalid) {
  document.querySelectorAll(".fabric-list-item").forEach((el) => {
    el.classList.toggle("active", String(el.dataset.id) === String(internalid));
  });
}

function clearActiveListItem() {
  document.querySelectorAll(".fabric-list-item").forEach((el) => {
    el.classList.remove("active");
  });
}

function handleSearch(event) {
  const term = event.target.value.trim().toLowerCase();

  filteredFabricData = fullFabricData.filter((item) => {
    return (
      String(item.displayName || "").toLowerCase().includes(term) ||
      String(item.colour || "").toLowerCase().includes(term) ||
      String(item.fabric || "").toLowerCase().includes(term)
    );
  });

  renderFabricList(filteredFabricData);

  const mainEl = document.getElementById("fabric-main");

  if (filteredFabricData.length > 0) {
    currentSelectedRecord = filteredFabricData[0];
    currentPanelJobId = getLatestJobIdForLabel(currentSelectedRecord.displayName);
    renderFabricDetail(currentSelectedRecord);
    setActiveListItem(currentSelectedRecord.internalid);
  } else {
    currentSelectedRecord = null;
    clearActiveListItem();
    mainEl.innerHTML = `
      <h2>Fabric Colours</h2>
      <p>No matching records found.</p>
      ${renderCurrentPanelStatus()}
    `;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}