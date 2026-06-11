const accountButtons = document.querySelectorAll('.account-item');

accountButtons.forEach(button => {
    button.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    button.addEventListener('mouseenter', () => { button.style.transform = 'scale(1.03)'; });
    button.addEventListener('mouseleave', () => { button.style.transform = 'scale(1)'; });
    button.addEventListener('mousedown',  () => { button.style.transform = 'scale(0.98)'; });
    button.addEventListener('mouseup',    () => { button.style.transform = 'scale(1.03)'; });

    button.addEventListener('click', () => {
        if (!button.classList.contains('add-account')) {
            const usernameEl = button.querySelector('.username');
            const phoneEl    = button.querySelector('.phone');

            // Отладка: выведем что нашли
            console.log('username:', usernameEl ? usernameEl.textContent : 'НЕ НАЙДЕН');
            console.log('phone:',    phoneEl    ? phoneEl.textContent    : 'НЕ НАЙДЕН');

            const username = usernameEl ? usernameEl.textContent.trim() : '';
            const phone    = phoneEl    ? phoneEl.textContent.trim()    : '';

            localStorage.setItem('currentUser', JSON.stringify({ username, phone }));

            // Отладка: проверим что сохранилось
            console.log('Сохранено в localStorage:', localStorage.getItem('currentUser'));

            window.location.href = 'main.html';
        }
    });
});