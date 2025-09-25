// footerLogs.js
console.log("footerLogs.js loaded ✅");

const footer = document.querySelector(".footer");
console.log("Footer element found:", footer);

if (footer) {
  // --- Create button in footer ---
  const logBtn = document.createElement("button");
  logBtn.textContent = "View Logs";
  logBtn.className = "footer-log-btn";

  const footerContent = footer.querySelector(".footer-content");
  (footerContent || footer).appendChild(logBtn);

  // --- Logs Modal ---
  const modal = document.createElement("div");
  modal.className = "log-modal hidden";
  modal.innerHTML = `
    <div class="log-modal-content">
      <span class="log-modal-close">&times;</span>
      <h2>Server Logs</h2>
      <pre id="log-output">Loading logs...</pre>
      <button id="report-issue-btn" class="report-issue-btn">Report Issue</button>
    </div>
  `;
  document.body.appendChild(modal);

  const closeBtn = modal.querySelector(".log-modal-close");
  const logOutput = modal.querySelector("#log-output");
  const reportBtn = modal.querySelector("#report-issue-btn");

  let pollInterval;

  // --- Report Issue Modal (sub modal) ---
  const issueModal = document.createElement("div");
  issueModal.className = "report-issue-modal hidden";
  issueModal.innerHTML = `
    <div class="report-issue-modal-content">
      <span class="report-issue-modal-close">&times;</span>
      <h2>Report Issue</h2>
      <input type="text" id="report-issue-title" placeholder="Enter issue title..." />
      <textarea id="report-issue-description" placeholder="please describe in as much detail the task you were carrying out, the product you were updating, and the fields you were trying to update, what you expected to happen, what actually happened."></textarea>
      <div class="report-issue-actions">
        <button id="cancel-report-issue" class="cancel-issue-btn">Cancel</button>
        <button id="save-report-issue" class="save-issue-btn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(issueModal);

  const issueClose = issueModal.querySelector(".report-issue-modal-close");
  const cancelIssue = issueModal.querySelector("#cancel-report-issue");
  const saveIssue = issueModal.querySelector("#save-report-issue");
  const issueTitle = issueModal.querySelector("#report-issue-title");
  const issueDesc = issueModal.querySelector("#report-issue-description");

  // --- Event handlers for logs modal ---
  logBtn.onclick = () => {
    modal.classList.remove("hidden");
    fetchLogs();
    pollInterval = setInterval(fetchLogs, 5000);
  };

  closeBtn.onclick = () => {
    modal.classList.add("hidden");
    clearInterval(pollInterval);
  };

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
      clearInterval(pollInterval);
    }
  });

  // --- Report Issue button ---
  reportBtn.onclick = () => {
    issueModal.classList.remove("hidden");
  };

  // --- Event handlers for issue modal ---
  [issueClose, cancelIssue].forEach((btn) =>
    btn.onclick = () => {
      issueModal.classList.add("hidden");
      issueTitle.value = "";
      issueDesc.value = "";
    }
  );

  saveIssue.onclick = async () => {
    const title = issueTitle.value.trim();
    const description = issueDesc.value.trim();
    const logs = logOutput.textContent;

    if (!title) {
      alert("Please enter a title for the issue.");
      return;
    }
    if (!description) {
      alert("Please enter a description before saving.");
      return;
    }

    try {
      const res = await fetch("/create-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body: `${description}\n\n---\n\nLogs:\n${logs}`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ Issue created: " + data.issueUrl);
        issueModal.classList.add("hidden");
        issueTitle.value = "";
        issueDesc.value = "";
      } else {
        alert("❌ Failed to create issue. Check server logs.");
      }
    } catch (err) {
      alert("❌ Error: " + err.message);
    }
  };

  // --- Fetch logs ---
  async function fetchLogs() {
    try {
      const res = await fetch("/logs");
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.text();
      logOutput.textContent = data || "ℹ️ No logs yet...";
      logOutput.scrollTop = logOutput.scrollHeight;
    } catch (err) {
      logOutput.textContent = "⚠️ Error fetching logs: " + err.message;
    }
  }
} else {
  console.error("⚠️ footerLogs.js: .footer element not found");
}
