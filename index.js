// API базовый URL
// ВАЖНО: Для Telegram Mini App нужен HTTPS!
// Настройте HTTPS на сервере (см. backend/HTTPS_SETUP.md)
// Временно можно использовать самоподписанный сертификат или ngrok для тестирования
const API_BASE_URL = 'https://82.97.240.215';  // HTTPS вместо HTTP

// Инициализация Telegram Web App
let tg = null;

// Глобальная переменная для данных пользователя
let userData = null;

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

        const response = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', 
            mode: 'cors', 
            body: JSON.stringify({
                init_data: initData
            })
        });

        

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Ошибка ответа сервера:', errorText);
            throw new Error(`Ошибка аутентификации: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Аутентификация успешна', data);
        
        // Сохраняем данные пользователя в глобальную переменную
        userData = data;
        
        
    } catch (error) {
        console.error('Ошибка при аутентификации:', error);
        console.error('Детали ошибки:', {
            message: error.message,
            name: error.name,
            stack: error.stack
        });
    
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



let main__screen = document.querySelector("#main__screen")
let buy_screen = document.querySelector(".buy__screen")
let create_ads_screen = document.querySelector(".create_ads_screen")
// ------------

let btn_buy_crypto = document.querySelector("#btn-for-buycrpyto")
let btn_sell_crypto = document.querySelector("#btn-for-sellcrpyto")
let btn_my_ads = document.querySelector("#create_ads")
// ------------

btn_buy_crypto.addEventListener("click", () => {
    main__screen.style.display = "none"

    buy_screen.style.display = "block"
})

btn_my_ads.addEventListener("click", () => {
    main__screen.style.display = "none"
    buy_screen.style.display = "none"
    create_ads_screen.style.display = "block"
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

// Segmented Control для создания объявления
function initSegmentedControl() {
    const segmentedBtns = document.querySelectorAll('.segmented_btn')
    if (!segmentedBtns.length) return
    
    segmentedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Убираем активный класс со всех кнопок
            segmentedBtns.forEach(b => b.classList.remove('segmented_btn--active'))
            // Добавляем активный класс на нажатую кнопку
            btn.classList.add('segmented_btn--active')
        })
    })
}

// Инициализация segmented control
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSegmentedControl)
} else {
    initSegmentedControl()
}

// Crypto Select Dropdown
function initCryptoSelect() {
    const cryptoSelectRow = document.querySelector('#crypto-select-row')
    const cryptoDropdown = document.querySelector('#crypto-dropdown')
    const selectedCrypto = document.querySelector('#selected-crypto')
    const cryptoOptions = document.querySelectorAll('.crypto_option')
    const checkUsdt = document.querySelector('#check-usdt')
    const checkTon = document.querySelector('#check-ton')
    const priceCryptoName = document.querySelector('#price-crypto-name')
    const priceCryptoSuffix = document.querySelector('#price-crypto-suffix')
    const amountCryptoSuffix = document.querySelector('#amount-crypto-suffix')
    const balanceCrypto = document.querySelector('#balance-crypto')
    const chevron = cryptoSelectRow?.querySelector('.chevron')
    
    if (!cryptoSelectRow || !cryptoDropdown) {
        console.warn('Crypto select elements not found')
        return
    }
    
    // Открытие/закрытие выпадающего списка
    cryptoSelectRow.addEventListener('click', (e) => {
        e.stopPropagation()
        const isOpen = cryptoDropdown.classList.contains('dropdown_open')
        cryptoDropdown.classList.toggle('dropdown_open')
        
        // Анимация chevron
        if (chevron) {
            if (!isOpen) {
                chevron.style.transform = 'rotate(90deg) translateX(3px)'
            } else {
                chevron.style.transform = 'translateX(0)'
            }
        }
    })
    
    // Выбор криптовалюты
    cryptoOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation()
            const crypto = option.getAttribute('data-crypto')
            
            if (!crypto) return
            
            // Обновляем выбранную криптовалюту
            if (selectedCrypto) {
                selectedCrypto.textContent = crypto
            }
            
            // Обновляем галочки
            if (crypto === 'USDT') {
                if (checkUsdt) checkUsdt.style.display = 'inline-block'
                if (checkTon) checkTon.style.display = 'none'
            } else if (crypto === 'TON') {
                if (checkUsdt) checkUsdt.style.display = 'none'
                if (checkTon) checkTon.style.display = 'inline-block'
            }
            
            // Обновляем текст в интерфейсе
            if (priceCryptoName) {
                priceCryptoName.textContent = `1 ${crypto}`
            }
            if (priceCryptoSuffix) {
                priceCryptoSuffix.textContent = crypto
            }
            if (amountCryptoSuffix) {
                amountCryptoSuffix.textContent = crypto
            }
            if (balanceCrypto) {
                balanceCrypto.textContent = crypto
            }
            
            // Закрываем выпадающий список
            cryptoDropdown.classList.remove('dropdown_open')
            if (chevron) {
                chevron.style.transform = 'translateX(0)'
            }
        })
    })
    
    // Закрытие при клике вне списка
    document.addEventListener('click', (e) => {
        if (cryptoSelectRow && !cryptoSelectRow.contains(e.target)) {
            cryptoDropdown.classList.remove('dropdown_open')
            if (chevron) {
                chevron.style.transform = 'translateX(0)'
            }
        }
    })
}

// Инициализация crypto select
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCryptoSelect)
} else {
    initCryptoSelect()
}
