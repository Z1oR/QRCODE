// API базовый URL
const API_BASE_URL = 'https://82.97.240.215';

// Инициализация Telegram Web App
let tg = null;

// Функция инициализации Telegram Web App
async function initTelegramWebApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        console.log('Telegram Web App инициализирован');
        
        // Проверяем доступность сервера перед аутентификацией
        try {
            const healthCheck = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                credentials: 'include',
                mode: 'cors'
            });
            
            if (healthCheck.ok) {
                console.log('Сервер доступен');
            } else {
                console.warn('Сервер отвечает с ошибкой:', healthCheck.status);
            }
        } catch (error) {
            console.error('Сервер недоступен! Проверьте:', error);
            console.error('1. Запущен ли сервер на', API_BASE_URL);
            console.error('2. Открыт ли порт 8000 в firewall');
            console.error('3. Возможно, Telegram блокирует запросы к IP адресам');
            console.error('   В этом случае используйте домен вместо IP');
            return false;
        }
        
        // После инициализации пытаемся аутентифицироваться
        if (tg.initData) {
            authenticateWithTelegram();
        } else {
            // Ждем появления initData
            const checkInitData = setInterval(() => {
                if (tg && tg.initData) {
                    clearInterval(checkInitData);
                    authenticateWithTelegram();
                }
            }, 100);
            
            // Останавливаем проверку через 5 секунд
            setTimeout(() => clearInterval(checkInitData), 5000);
        }
        
        return true;
    }
    return false;
}

// Пытаемся инициализировать сразу
(async () => {
    if (!(await initTelegramWebApp())) {
        // Если не получилось, ждем загрузки DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', async () => {
                if (!(await initTelegramWebApp())) {
                    // Пробуем еще раз через небольшую задержку
                    setTimeout(async () => {
                        if (!(await initTelegramWebApp())) {
                            console.warn('Telegram Web App не доступен');
                        }
                    }, 200);
                }
            });
        } else {
            // DOM уже загружен, но скрипт может еще загружаться
            setTimeout(async () => {
                if (!(await initTelegramWebApp())) {
                    console.warn('Telegram Web App не доступен');
                }
            }, 200);
        }
    }
})();


// Функция для проверки доступности сервера
async function checkServerAvailability() {
    try {
        const response = await fetch(`${API_BASE_URL}/docs`, {
            method: 'GET',
            mode: 'no-cors' // Для проверки доступности
        });
        return true;
    } catch (error) {
        console.warn('Сервер может быть недоступен:', error);
        return false;
    }
}

// Функция для аутентификации через Telegram
async function authenticateWithTelegram() {
    try {
        if (!tg) {
            console.warn('Telegram Web App не инициализирован');
            return;
        }
        
        // Получаем initData от Telegram
        const initData = tg.initData;
        
        if (!initData) {
            console.error('initData не получен от Telegram');
            return;
        }

        console.log('Начинаем аутентификацию...');
        console.log('API URL:', `${API_BASE_URL}/api/auth/telegram`);

        // Отправляем initData на сервер для аутентификации
        const response = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // Важно для работы с cookies
            mode: 'cors', // Явно указываем CORS режим
            body: JSON.stringify({
                init_data: initData
            })
        });

        console.log('Ответ сервера:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Ошибка ответа сервера:', errorText);
            throw new Error(`Ошибка аутентификации: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Аутентификация успешна', data);
        
        // Токены автоматически установлены в cookies сервером
        // Можно загрузить данные пользователя
        await loadUserData();
        
    } catch (error) {
        console.error('Ошибка при аутентификации:', error);
        console.error('Детали ошибки:', {
            message: error.message,
            name: error.name,
            stack: error.stack
        });
        
        // Показываем пользователю понятное сообщение
        if (error.message.includes('Failed to fetch')) {
            console.error('Проблема с подключением к серверу. Проверьте:');
            console.error('1. Запущен ли сервер на', API_BASE_URL);
            console.error('2. Открыт ли порт 8000 в firewall');
            console.error('3. Правильно ли настроен CORS на сервере');
        }
    }
}

// Функция для загрузки данных пользователя
async function loadUserData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: 'GET',
            credentials: 'include', // Важно для отправки cookies
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Если не авторизован, пытаемся аутентифицироваться
                await authenticateWithTelegram();
                return;
            }
            throw new Error('Ошибка загрузки данных пользователя');
        }

        const user = await response.json();
        console.log('Данные пользователя:', user);
        
        // Здесь можно обновить UI с данными пользователя
        // Например, отобразить имя пользователя
        
    } catch (error) {
        console.error('Ошибка при загрузке данных пользователя:', error);
    }
}

// Функция для выполнения защищенных запросов
async function makeAuthenticatedRequest(url, options = {}) {
    const defaultOptions = {
        credentials: 'include', // Всегда отправляем cookies
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    
    // Если получили 401, токены могли истечь - пытаемся обновить
    if (response.status === 401) {
        try {
            const refreshResponse = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
            });
            
            if (refreshResponse.ok) {
                // Повторяем оригинальный запрос после обновления токенов
                return fetch(url, { ...defaultOptions, ...options });
            }
        } catch (error) {
            console.error('Ошибка при обновлении токенов:', error);
        }
    }
    
    return response;
}

// Аутентификация теперь запускается автоматически в initTelegramWebApp()

let main__screen = document.querySelector("#main__screen")
let buy_screen = document.querySelector(".buy__screen")

// ------------

let btn_buy_crypto = document.querySelector("#btn-for-buycrpyto")
let btn_sell_crypto = document.querySelector("#btn-for-sellcrpyto")

// ------------

btn_buy_crypto.addEventListener("click", () => {
    main__screen.style.display = "none"

    buy_screen.style.display = "block"
})

// ------------
// Выпадающее меню для фильтра "Крипта"

function initCryptoFilter() {
    let cryptoFilter = document.querySelector("#crypto-filter")
    if (!cryptoFilter) return
    
    let cryptoDropdown = document.querySelector("#crypto-dropdown")
    let cryptoFilterValue = cryptoFilter.querySelector(".filter__value")
    let dropdownItems = cryptoDropdown.querySelectorAll(".dropdown__item")

    // Открытие/закрытие меню
    cryptoFilter.querySelector(".filter__header").addEventListener("click", (e) => {
        e.stopPropagation()
        cryptoFilter.classList.toggle("filter__open")
    })

    // Выбор опции из меню
    dropdownItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation()
            let value = item.getAttribute("data-value")
            
            // Обновляем выбранное значение
            cryptoFilterValue.textContent = value
            
            // Убираем выделение со всех элементов
            dropdownItems.forEach(i => i.classList.remove("dropdown__item--selected"))
            
            // Добавляем выделение на выбранный элемент
            item.classList.add("dropdown__item--selected")
            
            // Закрываем меню
            cryptoFilter.classList.remove("filter__open")
        })
    })

    // Закрытие меню при клике вне его (добавляем только один раз)
    if (!window.cryptoFilterClickHandler) {
        window.cryptoFilterClickHandler = (e) => {
            let cryptoFilter = document.querySelector("#crypto-filter")
            if (cryptoFilter && !cryptoFilter.contains(e.target)) {
                cryptoFilter.classList.remove("filter__open")
            }
        }
        document.addEventListener("click", window.cryptoFilterClickHandler)
    }
}

// Инициализация при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCryptoFilter)
} else {
    initCryptoFilter()
}

