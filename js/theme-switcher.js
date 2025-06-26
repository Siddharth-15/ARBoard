// js/theme-switcher.js
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const currentTheme = localStorage.getItem('theme') ? localStorage.getItem('theme') : null;
    const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-sun"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`; // Replace with your icon path or SVG
    const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-moon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`; // Replace with your icon path or SVG

    if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (themeToggleBtn) {
            themeToggleBtn.innerHTML = currentTheme === 'dark' ? sunIcon : moonIcon;
        }
    } else { // Default to light if no preference or system preference not implemented
        document.documentElement.setAttribute('data-theme', 'light');
         if (themeToggleBtn) {
            themeToggleBtn.innerHTML = moonIcon;
        }
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggleBtn.innerHTML = newTheme === 'dark' ? sunIcon : moonIcon;

            // If using particles.js, you might need to re-init or update colors
            // if (window.particlesJS && window.pJSDom && window.pJSDom[0]) {
            //    // Logic to update particle colors based on newTheme
            //    // This depends heavily on your particles.js config
            // }
        });
    }
});