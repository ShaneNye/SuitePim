// public/js/header.js
fetch('./header.html')
  .then(response => response.text())
  .then(html => {
    const container = document.getElementById('header-container');
    if (!container) return;
    container.innerHTML = html;

    // ⬇️ Safely append the environment once the header exists
    const env = localStorage.getItem('environment') || 'Sandbox';
    const h1 = container.querySelector('.header .title h1');
    if (h1) {
      // Keep existing left part, append " - <env>"
      // If your header.html h1 is always "Sussex Beds | SuitePim", this is fine:
      const base = h1.textContent.split(' - ')[0]; 
      h1.textContent = `${base} - ${env}`;
    }
  });

// Keep your existing page-title sync
document.addEventListener("DOMContentLoaded", function () {
  const pageTitle = document.title;
  const pageTitleEl = document.getElementById("page-title");
  if (pageTitleEl) pageTitleEl.textContent = pageTitle;
});

// Load footer as before
fetch('./footer.html')
  .then(response => response.text())
  .then(html => {
    const container = document.getElementById('footer-container');
    if (!container) return;
    container.innerHTML = html;
  });
