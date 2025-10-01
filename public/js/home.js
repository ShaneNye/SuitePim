// public/js/home.js
window.addEventListener("DOMContentLoaded", async () => {
  // --- One-time per-session refresh ---
  if (!sessionStorage.getItem("homeRefreshed")) {
    sessionStorage.setItem("homeRefreshed", "true");
    window.location.reload();
    return; // stop execution until after reload
  }

  // --- Auth / user ---
  try {
    const res = await fetch("/get-user");
    const data = await res.json();
    if (data.username) {
      const up = document.getElementById("username-placeholder");
      if (up) up.textContent = data.username;
    } else {
      window.location.href = "/";
      return;
    }
  } catch (err) {
    console.error("Error fetching user data:", err);
  }

  // --- Issues list ---
  try {
    const res = await fetch("/issues");
    const issues = await res.json();

    console.log(
      "✅ Issues received from backend:",
      (issues || []).map((i) => ({ title: i.title, number: i.number }))
    );

    const listEl = document.getElementById("issues-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    if (!issues || issues.length === 0) {
      listEl.innerHTML = "<li>No open issues 🎉</li>";
    } else {
      issues.forEach((issue) => {
        const li = document.createElement("li");
        li.dataset.issueNumber = issue.number; // for gold dot updates
        li.textContent = `${issue.title} — ${issue.appUser || issue.user.login}`;

        if (issue.labels && issue.labels.includes("alpha-feedback")) {
          li.classList.add("alpha-feedback");
        }

        // Initial gold dot check
        updateGoldDot(li, issue.number);

        li.addEventListener("click", () => openIssueModal(issue));
        listEl.appendChild(li);
      });
    }

    // ✅ Update the feature status dashboard blocks
    updateDashboardStatuses(issues);

  } catch (err) {
    console.error("Error fetching issues:", err);
    const listEl = document.getElementById("issues-list");
    if (listEl) listEl.innerHTML = "<li>⚠️ Failed to load issues</li>";
  }

  // --- Close handlers ---
  const modal = document.getElementById("issue-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeIssueModal();
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeIssueModal();
  });
  document.addEventListener("click", (e) => {
    const closeEl = e.target.closest("#close-modal");
    if (closeEl) {
      e.preventDefault();
      closeIssueModal();
    }
  });
});


function updateDashboardStatuses(issues) {
  const categories = {
    home: { div: ".open-home-issues", label: "home", title: "Home Dashboard" },
    "product-data": { div: ".open-product-data-issues", label: "Product Data", title: "Product Data" },
    "product-validation": { div: ".open-product-validation-issues", label: "Product Validation", title: "Product Validation" },
    "web-management": { div: ".open-web-management-issues", label: "Web Management", title: "Web Data Management" },
    "promotion-offers": { div: ".open-promotion-offers-issues", label: "Promotions & Offers", title: "Promotion & Offers" },
    "pending-review": { div: ".open-pending-review-issues", label: null, title: "Pending Review" }
  };

  // Keep track of IDs already assigned to a category
  const categorizedIds = new Set();

  // First handle all "normal" categories
  Object.entries(categories).forEach(([key, cat]) => {
    if (key === "pending-review") return; // skip for now

    const matching = issues.filter(i =>
      i.labels?.some(l =>
        l.toLowerCase().includes(key) || l.toLowerCase() === cat.label?.toLowerCase()
      )
    );

    matching.forEach(i => categorizedIds.add(i.number));
    updateCategoryTile(cat, matching);
  });

  // Handle Pending Review = any issue not in other categories
  const pending = issues.filter(i => !categorizedIds.has(i.number));
  updateCategoryTile(categories["pending-review"], pending);
}

function updateCategoryTile(cat, matching) {
  const container = document.querySelector(cat.div);
  if (!container) return;

  const count = matching.length;
  container.innerHTML = `<span class="issue-count">${count}</span>`;

  if (count > 0) {
    container.style.cursor = "pointer";
    container.onclick = () => openIssuesModal(cat.title, matching);
  } else {
    container.style.cursor = "default";
    container.onclick = null;
  }

  // Only normal categories get colored status — Pending Review is always neutral
  const widget = container.closest(".status-widget");
  const statusSpan = widget?.querySelector(".status-indicator");
  if (!statusSpan) return;

  if (cat.title === "Pending Review") {
    if (count === 0) {
      statusSpan.textContent = "No Pending Issues";
      statusSpan.className = "status-indicator online";
    } else {
      statusSpan.textContent = "Issues Awaiting Categorisation";
      statusSpan.className = "status-indicator warning";
    }
    return;
  }

  // Normal category status logic
  if (count === 0) {
    statusSpan.textContent = "Online";
    statusSpan.className = "status-indicator online";
  } else if (matching.some(i => i.labels.includes("Critical Error"))) {
    statusSpan.textContent = "Offline - Critical error Reported";
    statusSpan.className = "status-indicator offline";
  } else {
    statusSpan.textContent = "Online With Open Issues";
    statusSpan.className = "status-indicator warning";
  }
}


// --- Modal for issue details ---
function openIssuesModal(title, issues) {
  let modal = document.getElementById("issues-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "issues-modal";
    modal.className = "issues-modal";
    modal.innerHTML = `
      <div class="issues-modal-content">
        <span class="close-btn">&times;</span>
        <h3 id="issues-modal-title"></h3>
        <div id="issues-modal-body"></div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelector(".close-btn").onclick = () => modal.classList.remove("open");
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("open");
    });
  }

  document.getElementById("issues-modal-title").textContent = `${title} – ${issues.length} Open Issue${issues.length > 1 ? "s" : ""}`;

  const body = document.getElementById("issues-modal-body");
  body.innerHTML = issues
    .map(i => `<div class="issue-item">#${i.number} — ${i.title}</div>`)
    .join("");

  modal.classList.add("open");
}



// --- Helpers ---
function formatDate(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function closeIssueModal() {
  const modal = document.getElementById("issue-modal");
  if (modal) {
    modal.classList.remove("open");
    modal.style.display = "none";
  }
}

function openIssueModal(issue) {
  const titleEl = document.getElementById("modal-title");
  const reporterEl = document.getElementById("modal-reporter");
  const dateEl = document.getElementById("modal-date");
  if (titleEl) titleEl.textContent = issue.title;
  if (reporterEl) {
    reporterEl.textContent = issue.appUser || issue.user.login;
  }
  if (dateEl) dateEl.textContent = formatDate(issue.created_at);

  const modalBody = document.getElementById("modal-body");
  if (!modalBody) return;
  modalBody.innerHTML = "";

  // Clean description
  let cleanBody = issue.body || "";
  cleanBody = cleanBody
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("Environment:") &&
        !line.startsWith("👤 Reported by:") &&
        !line.startsWith("🌍 Environment:")
    )
    .join("\n");

  const desc = document.createElement("div");
  desc.innerHTML = cleanBody
    ? cleanBody.replace(/\n/g, "<br>")
    : "<em>No description provided.</em>";
  modalBody.appendChild(desc);

  // Comments container
  const commentsContainer = document.createElement("div");
  commentsContainer.id = "comments-container";
  commentsContainer.innerHTML = "<h4>Comments</h4><p>Loading...</p>";
  modalBody.appendChild(commentsContainer);

  // Load comments
  fetch(`/issues/${issue.number}/comments`)
    .then((res) => res.json())
    .then((comments) => {
      commentsContainer.innerHTML = "<h4>Comments</h4>";

      const userAlignments = {};
      const availableAlignments = ["left", "right"];
      let nextIndex = 0;

      if (Array.isArray(comments)) {
        if (comments.length === 0) {
          commentsContainer.innerHTML += "<p>No comments yet.</p>";
        } else {
          comments.forEach((c) => {
            renderComment(
              c,
              commentsContainer,
              userAlignments,
              availableAlignments,
              () => nextIndex++
            );
          });
        }

        // ✅ Always add reply UI
        addReplyUI(
          issue,
          commentsContainer,
          userAlignments,
          availableAlignments,
          () => nextIndex++
        );
      } else {
        commentsContainer.innerHTML += `<p>⚠️ GitHub Error: ${
          comments.message || "Unknown error"
        }</p>`;
      }
    })
    .catch((err) => {
      commentsContainer.innerHTML =
        "<h4>Comments</h4><p>⚠️ Failed to load comments.</p>";
      console.error(`❌ Failed to load comments for #${issue.number}:`, err);
    });

  const modal = document.getElementById("issue-modal");
  if (modal) {
    modal.style.display = "block";
    modal.classList.add("open");
  }
}

// --- Rendering helper ---
function renderComment(
  c,
  container,
  userAlignments,
  availableAlignments,
  nextIndexFn,
  beforeEl = null
) {
  let displayUser = c.user.login;
  let text = c.body;
  const match = text.match(/^\*\*\[(.+?)\]\*\*\n/);
  if (match) {
    displayUser = match[1];
    text = text.replace(match[0], "");
  }

  // Get last rendered comment
  const lastComment = container.querySelector(".comment:last-of-type");
  let lastUser = null;
  let lastAlignment = "left";
  if (lastComment) {
    lastUser = lastComment.querySelector(".comment-author")?.textContent?.replace(":", "");
    lastAlignment = lastComment.classList.contains("right") ? "right" : "left";
  }

  // Assign alignment
  if (!userAlignments[displayUser]) {
    if (lastUser && displayUser !== lastUser) {
      // Different user replying → opposite side of last comment
      userAlignments[displayUser] = lastAlignment === "left" ? "right" : "left";
    } else {
      // Fallback to cycling
      userAlignments[displayUser] =
        availableAlignments[nextIndexFn() % availableAlignments.length];
    }
  }
  const alignment = userAlignments[displayUser];

  // Build comment element
  const wrapper = document.createElement("div");
  wrapper.classList.add("comment", alignment);

  const header = document.createElement("div");
  header.classList.add("comment-header");

  const author = document.createElement("span");
  author.classList.add("comment-author");
  author.textContent = `${displayUser}:`;

  const date = document.createElement("span");
  date.classList.add("comment-date");
  date.textContent = formatDate(c.created_at);

  header.appendChild(author);
  header.appendChild(date);

  const body = document.createElement("div");
  body.classList.add("comment-body");
  body.textContent = text;

  wrapper.appendChild(header);
  wrapper.appendChild(body);

  if (beforeEl) {
    container.insertBefore(wrapper, beforeEl);
  } else {
    container.appendChild(wrapper);
  }
}



// --- Reply UI helper ---
function addReplyUI(issue, commentsContainer, userAlignments, availableAlignments, nextIndexFn) {
  const oldReplyBox = document.getElementById("reply-box");
  if (oldReplyBox) oldReplyBox.remove();
  const oldReplyBtn = document.getElementById("reply-btn");
  if (oldReplyBtn) oldReplyBtn.remove();

  const replyBox = document.createElement("textarea");
  replyBox.id = "reply-box";
  replyBox.placeholder = "Write a reply...";
  replyBox.style.width = "100%";
  replyBox.style.marginTop = "1rem";

  const replyBtn = document.createElement("button");
  replyBtn.id = "reply-btn";
  replyBtn.textContent = "Reply";
  replyBtn.style.marginTop = "0.5rem";

  replyBtn.addEventListener("click", async () => {
    const body = replyBox.value.trim();
    if (!body) return;

    try {
      const res = await fetch(`/issues/${issue.number}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        renderComment(
          result.comment,
          commentsContainer,
          userAlignments,
          availableAlignments,
          nextIndexFn,
          replyBox
        );

        replyBox.value = "";

        // Update gold dot straight away
        const issueLi = document.querySelector(
          `#issues-list li[data-issue-number="${issue.number}"]`
        );
        if (issueLi) {
          updateGoldDot(issueLi, issue.number);
        }
      } else {
        console.error("❌ GitHub post comment error:", result);
      }
    } catch (err) {
      console.error("❌ Reply post failed:", err);
    }
  });

  commentsContainer.appendChild(replyBox);
  commentsContainer.appendChild(replyBtn);
}

// --- Gold dot helper ---
async function updateGoldDot(li, issueNumber) {
  try {
    const res = await fetch(`/issues/${issueNumber}/comments`);
    const comments = await res.json();

    if (Array.isArray(comments) && comments.length > 0) {
      const last = comments[comments.length - 1];

      // Parse SuitePim username if embedded
      let lastUser = last.user.login;
      let text = last.body || "";
      const match = text.match(/^\*\*\[(.+?)\]\*\*\n/);
      if (match) {
        lastUser = match[1];
      }

      // Current logged in SuitePim user
      const userRes = await fetch("/get-user");
      const currentUser = await userRes.json();
      const currentAppUser = currentUser?.username;

      // Remove existing dot
      const existingDot = li.querySelector(".gold-dot");
      if (existingDot) existingDot.remove();

      // Add dot if last commenter ≠ current user
      if (lastUser && lastUser !== currentAppUser) {
        const dot = document.createElement("span");
        dot.classList.add("gold-dot");
        Object.assign(dot.style, {
          display: "inline-block",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          backgroundColor: "#FFD700",
          marginLeft: "8px",
        });
        li.appendChild(dot);
        console.log(
          `⭐ Gold dot updated: last by ${lastUser}, not ${currentAppUser}, issue #${issueNumber}`
        );
      }
    }
  } catch (err) {
    console.error(`❌ Failed to update gold dot for issue #${issueNumber}:`, err);
  }
}
