// public/js/login.js
document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const environment = document.getElementById("enviroment")?.value || "Sandbox";

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, environment }), // <-- add environment
    });

    const data = await res.json();
    if (data.success) {
      localStorage.setItem("username", username);
      localStorage.setItem("environment", environment);
      window.location.href = "/home.html";
    } else {
      alert(data.message || "Login failed");
    }
  } catch (err) {
    console.error("Error logging in:", err);
    alert("An error occurred. Please try again.");
  }
});
