// Функция для обновления UI с данными пользователя
function updateUserUI(userData, isAuthenticated) {
    const statusText = document.getElementById('status-text');
    const username = document.getElementById('username');
    const telegramId = document.getElementById('telegram-id');
    const paymentSection = document.getElementById('payment-section');

    if (isAuthenticated) {
        statusText.textContent = 'Authenticated';
        statusText.className = 'authenticated';
        username.textContent = userData.username || 'Not set';
        telegramId.textContent = userData.id;
        paymentSection.classList.remove('hidden');
    } else {
        statusText.textContent = 'No auth';
        statusText.className = 'not-authenticated';
        username.textContent = userData.username || 'Not set';
        telegramId.textContent = '-';
        paymentSection.classList.add('hidden');
    }
}

// Функция аутентификации
async function authenticate() {
    try {
        const initData = window.Telegram.WebApp.initData;
        const response = await fetch('https://185.84.162.89:8000/auth/telegram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                initData: initData
            }),
            mode: 'cors',
            credentials: 'same-origin'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        updateUserUI(data.user, true);
        return data;
    } catch (error) {
        console.error('Authentication error:', error);
        // В случае ошибки показываем данные пользователя из Telegram
        const user = window.Telegram.WebApp.initDataUnsafe.user || {};
        updateUserUI(user, false);
    }
}

// Проверяем аутентификацию при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    authenticate();
});

// Обработчик для кнопки оплаты
const PayButton = document.querySelector('.payment');
PayButton.addEventListener('click', () => {
    // Проверяем аутентификацию перед сканированием
    authenticate().then(data => {
        if (data && data.success) {
            // Здесь код для сканирования QR-кода
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                // Create status message display
                const statusDisplay = document.createElement('div');
                statusDisplay.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 5px;
                    z-index: 1001;
                    max-width: 80%;
                    text-align: center;
                    font-family: Arial, sans-serif;
                `;
                document.body.appendChild(statusDisplay);

                // Create scanning frame
                const frame = document.createElement('div');
                frame.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 250px;
                    height: 250px;
                    border: 2px solid #00ff00;
                    z-index: 1000;
                    pointer-events: none;
                `;
                
                // Add corner markers
                const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
                corners.forEach(corner => {
                    const marker = document.createElement('div');
                    marker.style.cssText = `
                        position: absolute;
                        width: 20px;
                        height: 20px;
                        border: 2px solid #00ff00;
                        ${corner.includes('top') ? 'top: 0;' : 'bottom: 0;'}
                        ${corner.includes('left') ? 'left: 0;' : 'right: 0;'}
                        border-${corner.includes('top') ? 'bottom' : 'top'}: none;
                        border-${corner.includes('left') ? 'right' : 'left'}: none;
                    `;
                    frame.appendChild(marker);
                });

                // Create video element
                const video = document.createElement('video');
                document.body.appendChild(video);
                video.srcObject = stream;
                video.setAttribute('playsinline', true);
                video.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                `;
                video.play();

                // Add scanning frame to the page
                document.body.appendChild(frame);

                // Create canvas for QR scanning
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                let scanning = true;

                // Scan QR code
                function scan() {
                    if (video.readyState === video.HAVE_ENOUGH_DATA && scanning) {
                        canvas.height = video.videoHeight;
                        canvas.width = video.videoWidth;
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        
                        try {
                            const code = jsQR(
                                context.getImageData(0, 0, canvas.width, canvas.height).data,
                                canvas.width,
                                canvas.height
                            );
                            
                            if (code) {
                                statusDisplay.textContent = `QR-код обнаружен: ${code.data}`;
                                scanning = false;
                                stream.getTracks().forEach(track => track.stop());
                                video.remove();
                                frame.remove();
                                // Handle the QR code data here
                                setTimeout(() => {
                                    statusDisplay.textContent = 'Сканирование завершено';
                                    setTimeout(() => statusDisplay.remove(), 2000);
                                }, 2000);
                            }
                        } catch (e) {
                            statusDisplay.textContent = `Ошибка сканирования: ${e.message}`;
                            console.error("QR scanning error:", e);
                        }
                    }
                    if (scanning) {
                        requestAnimationFrame(scan);
                    }
                }

                requestAnimationFrame(scan);
            } else {
                alert("Извините, ваш браузер не поддерживает доступ к камере");
            }
        } else {
            alert("Пожалуйста, авторизуйтесь для использования сканера");
        }
    });
});


