// public/js/login.js
const loginBtn = document.getElementById("loginBtn");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const environmentInput = document.getElementById("enviroment");

async function handleLogin() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const environment = environmentInput?.value || "Sandbox";

  if (!username || !password) {
    alert("Please enter both username and password.");
    return;
  }

  // disable while request runs
  loginBtn.disabled = true;
  usernameInput.disabled = true;
  passwordInput.disabled = true;

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, environment }),
    });

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error("⚠️ Could not parse server response as JSON:", parseErr);
      data = { success: false, message: "Login failed. Invalid server response." };
    }

    if (data.success) {
      console.log("✅ Login successful");
      localStorage.setItem("username", username);
      localStorage.setItem("environment", environment);

      // ✅ Show loading overlay
      const overlay = document.getElementById("loading-overlay");
      if (overlay) {
        overlay.style.display = "flex";
      }

      // small delay to let spinner paint before redirect
      setTimeout(() => {
        window.location.href = "/home.html";
      }, 200);
    } else {
      console.warn("❌ Login failed:", data.message);
      alert(data.message || "Login failed. Please check your credentials.");
    }
  } catch (err) {
    console.error("💥 Error logging in:", err);
    alert("An error occurred while logging in. Please try again.");
  } finally {
    console.log("🔄 Resetting inputs so user can retry");
    loginBtn.disabled = false;
    usernameInput.disabled = false;
    passwordInput.disabled = false;

    // ✅ force repaint/reflow so inputs are re-enabled correctly
    usernameInput.style.display = "none";
    usernameInput.offsetHeight; // trigger reflow
    usernameInput.style.display = "";

    usernameInput.focus();
  }
}

// --- Button click handler ---
loginBtn.addEventListener("click", (e) => {
  e.preventDefault();
  handleLogin();
});

// --- Enter key handler ---
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleLogin();
  }
});
