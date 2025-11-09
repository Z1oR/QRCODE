// API базовый URL
const API_BASE_URL = 'http://82.97.240.215:8000';

// Инициализация Telegram Web App
let tg = null;

tg = window.Telegram.WebApp;
tg.ready();
tg.expand();


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

        // Отправляем initData на сервер для аутентификации
        const response = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // Важно для работы с cookies
            body: JSON.stringify({
                init_data: initData
            })
        });

        if (!response.ok) {
            throw new Error('Ошибка аутентификации');
        }

        const data = await response.json();
        console.log('Аутентификация успешна', data);
        
        // Токены автоматически установлены в cookies сервером
        // Можно загрузить данные пользователя
        await loadUserData();
        
    } catch (error) {
        console.error('Ошибка при аутентификации:', error);
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

// Инициализация при загрузке страницы
if (tg && tg.initData) {
    authenticateWithTelegram();
} else if (tg) {
    // Ждем инициализации Telegram Web App
    tg.ready();
    if (tg.initData) {
        authenticateWithTelegram();
    }
}

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
