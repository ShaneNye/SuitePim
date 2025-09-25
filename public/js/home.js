// public/js/home.js
window.addEventListener("DOMContentLoaded", async () => {
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
      return;
    }

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

        // Always insert before reply box
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
