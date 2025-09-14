// public/js/support.js
document.getElementById("support-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("issue-title").value;
  const description = document.getElementById("issue-description").value;

  const messageEl = document.getElementById("support-message");
  messageEl.textContent = "Submitting your request...";

  try {
    const res = await fetch("/create-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body: description // only send description now
      })
    });

    if (res.ok) {
      const data = await res.json();
      messageEl.innerHTML = `✅ Submitted. <a href="${data.issueUrl}" target="_blank">View on GitHub</a>`;
      document.getElementById("support-form").reset();
    } else {
      messageEl.textContent = "❌ Error submitting your request.";
    }
  } catch (err) {
    console.error(err);
    messageEl.textContent = "❌ Could not connect to the server.";
  }
});
