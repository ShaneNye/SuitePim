const API_BASE = "http://localhost:3000";

// Create footer progress bar if not already present
function ensureFooterProgress() {
  let container = document.getElementById("footer-job-status");
  if (!container) {
    container = document.createElement("div");
    container.id = "footer-job-status";
    container.classList.add("footer-status");

    container.innerHTML = `
      <div class="progress-wrapper">
        <div class="progress-bar"></div>
      </div>
      <p class="progress-text">ℹ️ Checking job status...</p>
    `;

    document.querySelector(".footer").appendChild(container);
  }
  return container;
}

function updateFooterProgress(processed, total, status, queuePos, queueTotal) {
  const container = ensureFooterProgress();
  const bar = container.querySelector(".progress-bar");
  const text = container.querySelector(".progress-text");

  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  bar.style.width = percent + "%";

  const qPos = queuePos || 1;
  const qTotal = queueTotal || 1;

  if (status === "completed") {
    text.textContent = `✅ Job ${qPos} of ${qTotal} finished. ${processed} of ${total} sent to NetSuite.`;
  } else if (status === "error") {
    text.textContent = `❌ Job ${qPos} of ${qTotal} encountered errors. ${processed} of ${total} sent.`;
  } else if (status === "pending") {
    text.textContent = `⏳ Job ${qPos} of ${qTotal} waiting...`;
  } else if (status === "running") {
    text.textContent = `🚀 Job ${qPos} of ${qTotal} — Sending ${processed} of ${total} to NetSuite...`;
  } else {
    text.textContent = `ℹ️ Checking job status...`;
  }

  // Save only if still active
  if (status === "pending" || status === "running") {
    localStorage.setItem(
      "lastJobState",
      JSON.stringify({ processed, total, status, queuePos: qPos, queueTotal: qTotal })
    );
  } else {
    localStorage.removeItem("lastJobState");
    localStorage.removeItem("lastJobId");
  }
}

// Poll the server for job status
async function checkFooterJobStatus() {
  const jobId = localStorage.getItem("lastJobId");
  if (!jobId) return; // no active job

  try {
    const res = await fetch(`${API_BASE}/push-status/${jobId}`);
    if (!res.ok) {
      // purge if server doesn’t know this job
      localStorage.removeItem("lastJobId");
      localStorage.removeItem("lastJobState");
      return;
    }

    const job = await res.json();
    if (!job || typeof job.status !== "string") {
      localStorage.removeItem("lastJobId");
      localStorage.removeItem("lastJobState");
      return;
    }

    updateFooterProgress(job.processed, job.total, job.status, job.queuePos, job.queueTotal);

    if (job.status === "pending" || job.status === "running") {
      setTimeout(checkFooterJobStatus, 3000); // keep polling
    } else {
      localStorage.removeItem("lastJobId");
      localStorage.removeItem("lastJobState");

      // auto fade after 5s
      setTimeout(() => {
        const container = document.getElementById("footer-job-status");
        if (container) container.remove();
      }, 5000);
    }
  } catch (err) {
    console.error("Footer job status error:", err);
    localStorage.removeItem("lastJobId");
    localStorage.removeItem("lastJobState");
  }
}

// On page load
window.addEventListener("DOMContentLoaded", async () => {
  const jobId = localStorage.getItem("lastJobId");

  if (jobId) {
    // Validate with server — purge stale jobs
    try {
      const res = await fetch(`${API_BASE}/push-status/${jobId}`);
      if (!res.ok) {
        localStorage.removeItem("lastJobId");
        localStorage.removeItem("lastJobState");
        return;
      }

      const job = await res.json();
      if (job.status === "pending" || job.status === "running") {
        ensureFooterProgress();
        updateFooterProgress(job.processed, job.total, job.status, job.queuePos, job.queueTotal);
        checkFooterJobStatus();
      } else {
        localStorage.removeItem("lastJobId");
        localStorage.removeItem("lastJobState");
      }
    } catch {
      localStorage.removeItem("lastJobId");
      localStorage.removeItem("lastJobState");
    }
  }
});

// ✅ Make available globally
window.updateFooterProgress = updateFooterProgress;
