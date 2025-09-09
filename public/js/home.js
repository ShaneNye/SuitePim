// public/js/home.js
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/get-user');
        const data = await res.json();

        if(data.username){
            document.getElementById('username-placeholder').textContent = data.username;
        } else {
            // If no user is logged in, redirect back to login
            window.location.href = '/';
        }
    } catch (err) {
        console.error('Error fetching user data:', err);
    }
});
