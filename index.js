// API базовый URL
// ВАЖНО: Для Telegram Mini App нужен HTTPS!
// Настройте HTTPS на сервере (см. backend/HTTPS_SETUP.md)
// Временно можно использовать самоподписанный сертификат или ngrok для тестирования
// API базовый URL
// ВАЖНО: Telegram приложение может блокировать запросы к IP адресам!
// Рекомендуется использовать домен вместо IP
const API_BASE_URL = 'https://82.97.240.215:8000';  // HTTPS с портом 8000

// Альтернативный вариант с доменом (если настроен):
// const API_BASE_URL = 'https://yourdomain.com';

// Инициализация Telegram Web App
let tg = null;

// Глобальная переменная для данных пользователя
let userData = null;
// Глобальные переменные для токенов
let accessToken = null;
let refreshToken = null;

// Функция инициализации Telegram Web App
async function initTelegramWebApp() {
    console.log('Инициализация Telegram Web App...');
    console.log('window.Telegram:', !!window.Telegram);
    console.log('window.Telegram.WebApp:', !!(window.Telegram && window.Telegram.WebApp));
    console.log('User Agent:', navigator.userAgent);
    console.log('API Base URL:', API_BASE_URL);
    
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        console.log('Telegram Web App инициализирован');
        console.log('Telegram WebApp version:', tg.version);
        console.log('Telegram WebApp platform:', tg.platform);
        
            // Проверяем доступность сервера перед аутентификацией
        try {
            console.log('Проверка доступности сервера:', `${API_BASE_URL}/health`);
            // Пробуем сначала HTTPS, если не работает - пробуем HTTP
            let healthCheck;
            let apiUrl = API_BASE_URL;
            
            try {
                healthCheck = await fetch(`${apiUrl}/health`, {
                    method: 'GET',
                    credentials: 'include',
                    mode: 'cors'
                });
            } catch (httpsError) {
                console.warn('HTTPS запрос не прошел, пробуем HTTP...', httpsError);
                // Пробуем HTTP как fallback
                apiUrl = API_BASE_URL.replace('https://', 'http://');
                try {
                    healthCheck = await fetch(`${apiUrl}/health`, {
                        method: 'GET',
                        credentials: 'include',
                        mode: 'cors'
                    });
                    console.warn('ВНИМАНИЕ: Используется HTTP вместо HTTPS! Это небезопасно и может не работать в Telegram приложении.');
                } catch (httpError) {
                    console.error('Ошибка при проверке сервера (и HTTPS, и HTTP не работают):', {
                        httpsError: httpsError.message,
                        httpError: httpError.message
                    });
                    throw httpsError; // Бросаем оригинальную ошибку
                }
            }
            
            if (healthCheck.ok) {
                console.log('Сервер доступен, статус:', healthCheck.status);
            } else {
                console.warn('Сервер отвечает с ошибкой:', healthCheck.status);
            }
        } catch (error) {
            console.error('Сервер недоступен! Проверьте:', error);
            console.error('1. Запущен ли сервер на', API_BASE_URL);
            console.error('2. Открыт ли порт 8000 в firewall');
            console.error('3. Возможно, Telegram блокирует запросы к IP адресам');
            console.error('   В этом случае используйте домен вместо IP');
            console.error('4. Проверьте, что используется HTTPS (Telegram требует HTTPS)');
            
            // Показываем пользователю понятное сообщение
            if (tg && tg.showAlert) {
                tg.showAlert('Ошибка подключения к серверу. Проверьте интернет-соединение.');
            }
            
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

        console.log('Отправка запроса на аутентификацию:', API_BASE_URL);
        
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
        }).catch(error => {
            console.error('Ошибка сети при отправке запроса:', error);
            console.error('Тип ошибки:', error.name);
            console.error('Сообщение:', error.message);
            throw error;
        });
        
        console.log('Ответ получен:', response.status, response.statusText);

        

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Ошибка ответа сервера:', errorText);
            throw new Error(`Ошибка аутентификации: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Аутентификация успешна, полученные данные:', {
            hasAccessToken: !!data.access_token,
            hasRefreshToken: !!data.refresh_token,
            accessTokenLength: data.access_token ? data.access_token.length : 0,
            refreshTokenLength: data.refresh_token ? data.refresh_token.length : 0,
            allFields: Object.keys(data)
        });
        
        // Проверяем, что токены есть в ответе
        if (!data.access_token || !data.refresh_token) {
            console.error('ОШИБКА: Токены не получены от сервера!', data);
            throw new Error('Токены не получены от сервера');
        }
        
        // Сохраняем данные пользователя в глобальную переменную
        userData = data;
        
        // Сохраняем токены
        accessToken = data.access_token;
        refreshToken = data.refresh_token;
        
        console.log('Токены сохранены в память:', {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            accessTokenLength: accessToken ? accessToken.length : 0,
            refreshTokenLength: refreshToken ? refreshToken.length : 0
        });
        
        // Проверяем, что токены есть в cookie (сервер должен установить их)
        setTimeout(() => {
            const cookieAccessToken = getCookie('ACCESS_TOKEN');
            const cookieRefreshToken = getCookie('REFRESH_TOKEN');
            console.log('Токены в cookie после сохранения (через 500ms):', {
                hasCookieAccessToken: !!cookieAccessToken,
                hasCookieRefreshToken: !!cookieRefreshToken,
                cookieAccessTokenLength: cookieAccessToken ? cookieAccessToken.length : 0,
                cookieRefreshTokenLength: cookieRefreshToken ? cookieRefreshToken.length : 0,
                allCookies: document.cookie
            });
            
            // Если токенов нет в cookie, но есть в памяти - это нормально для некоторых случаев
            if (!cookieAccessToken && accessToken) {
                console.warn('ВНИМАНИЕ: Токен есть в памяти, но не в cookie. Это может быть нормально, если cookie не устанавливаются из-за настроек безопасности.');
            }
        }, 500);
        
        
    } catch (error) {
        console.error('Ошибка при аутентификации:', error);
        console.error('Детали ошибки:', {
            message: error.message,
            name: error.name,
            stack: error.stack
        });
    
    }
}

// Функция для получения токена из cookie
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Инициализация токенов из cookie при загрузке страницы
function initTokensFromCookies() {
    const cookieAccessToken = getCookie('ACCESS_TOKEN');
    const cookieRefreshToken = getCookie('REFRESH_TOKEN');
    
    if (cookieAccessToken) {
        accessToken = cookieAccessToken;
        console.log('Access token загружен из cookie, длина:', accessToken.length);
    }
    
    if (cookieRefreshToken) {
        refreshToken = cookieRefreshToken;
        console.log('Refresh token загружен из cookie, длина:', refreshToken.length);
    }
    
    if (!accessToken && !refreshToken) {
        console.warn('Токены не найдены в cookie при инициализации');
    } else {
        console.log('Токены успешно инициализированы из cookie');
    }
}

// Вызываем при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTokensFromCookies);
} else {
    initTokensFromCookies();
}

// Функция для выполнения защищенных запросов
async function makeAuthenticatedRequest(url, options = {}) {
    // Получаем токен из глобальной переменной или cookie
    let token = accessToken || getCookie('ACCESS_TOKEN');
    
    // Логируем все возможные источники токена
    const cookieToken = getCookie('ACCESS_TOKEN');
    console.log('makeAuthenticatedRequest - проверка токенов:', {
        url,
        hasAccessToken: !!accessToken,
        accessTokenLength: accessToken ? accessToken.length : 0,
        hasCookieToken: !!cookieToken,
        cookieTokenLength: cookieToken ? cookieToken.length : 0,
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
        allCookies: document.cookie
    });
    
    const defaultOptions = {
        credentials: 'include', // Всегда отправляем cookies
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    
    // Добавляем токен в заголовок Authorization, если он есть
    if (token) {
        defaultOptions.headers['Authorization'] = `Bearer ${token}`;
        console.log('Токен добавлен в заголовок Authorization, первые 20 символов:', token.substring(0, 20) + '...');
    } else {
        console.error('ТОКЕН НЕ НАЙДЕН! Проверьте:');
        console.error('- accessToken в памяти:', accessToken);
        console.error('- ACCESS_TOKEN в cookie:', cookieToken);
        console.error('- Все cookies:', document.cookie);
    }

    const response = await fetch(url, { ...defaultOptions, ...options });
    
    // Если получили 401, токены могли истечь - пытаемся обновить
    if (response.status === 401) {
        try {
            // Получаем refresh token
            const refreshTokenValue = refreshToken || getCookie('REFRESH_TOKEN');
            
            if (!refreshTokenValue) {
                console.error('Refresh token не найден');
                return response;
            }
            
            const refreshResponse = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${refreshTokenValue}`
                }
            });
            
            if (refreshResponse.ok) {
                const tokenData = await refreshResponse.json();
                // Обновляем токены
                accessToken = tokenData.access_token;
                refreshToken = tokenData.refresh_token;
                
                // Повторяем оригинальный запрос с новым токеном
                defaultOptions.headers['Authorization'] = `Bearer ${accessToken}`;
                return fetch(url, { ...defaultOptions, ...options });
            } else {
                console.error('Ошибка обновления токена:', await refreshResponse.text());
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

btn_buy_crypto.addEventListener("click", async () => {
    main__screen.style.display = "none"
    buy_screen.style.display = "block"
    
    console.log('Экран покупки открыт, загружаем объявления...')
    
    // Загружаем объявления при открытии экрана покупки
    const selectedCrypto = document.querySelector('.filter__value')?.textContent || 'TON'
    console.log('Выбранная криптовалюта:', selectedCrypto)
    
    const ads = await loadAds('sell', selectedCrypto)
    console.log('Объявления загружены, отображаем:', ads.length)
    displayAds(ads)
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
    
    const detailLabel = document.querySelector('.detail_row--selectable .detail_label')
    const paymentDetailsSection = document.querySelector('#payment-details-section')
    
    segmentedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Убираем активный класс со всех кнопок
            segmentedBtns.forEach(b => b.classList.remove('segmented_btn--active'))
            // Добавляем активный класс на нажатую кнопку
            btn.classList.add('segmented_btn--active')
            
            // Обновляем текст в зависимости от действия
            const action = btn.getAttribute('data-action')
            if (detailLabel) {
                if (action === 'buy') {
                    detailLabel.textContent = 'Купить криптовалюту'
                } else {
                    detailLabel.textContent = 'Продать криптовалюту'
                }
            }
            
            // Показываем/скрываем секцию реквизитов
            if (paymentDetailsSection) {
                if (action === 'sell') {
                    paymentDetailsSection.style.display = 'block'
                } else {
                    paymentDetailsSection.style.display = 'none'
                }
            }
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
    const cryptoDropdown = document.querySelector('.create_ads_screen #crypto-dropdown')
    const selectedCrypto = document.querySelector('.create_ads_screen #selected-crypto')
    const cryptoOptions = document.querySelectorAll('.create_ads_screen .crypto_option')
    const checkUsdt = document.querySelector('.create_ads_screen #check-usdt')
    const checkTon = document.querySelector('.create_ads_screen #check-ton')
    const priceCryptoName = document.querySelector('#price-crypto-name')
    const priceCryptoSuffix = document.querySelector('#price-crypto-suffix')
    const amountCryptoSuffix = document.querySelector('#amount-crypto-suffix')
    const balanceCrypto = document.querySelector('#balance-crypto')
    const chevron = cryptoSelectRow?.querySelector('.chevron')
    
    if (!cryptoSelectRow || !cryptoDropdown) {
        console.warn('Crypto select elements not found', {
            cryptoSelectRow: !!cryptoSelectRow,
            cryptoDropdown: !!cryptoDropdown
        })
        return
    }
    
    console.log('Crypto select initialized successfully')
    
    // Открытие/закрытие выпадающего списка
    cryptoSelectRow.addEventListener('click', (e) => {
        e.stopPropagation()
        console.log('Crypto select row clicked')
        const isOpen = cryptoDropdown.classList.contains('dropdown_open')
        cryptoDropdown.classList.toggle('dropdown_open')
        console.log('Dropdown toggled, isOpen:', !isOpen)
        
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

// Payment Method Selection
function initPaymentMethodSelection() {
    const paymentMethodItems = document.querySelectorAll('.payment_method_item')
    const customBankWrapper = document.querySelector('#custom-bank-wrapper')
    
    if (!paymentMethodItems.length) return
    
    // По умолчанию выбираем первый метод
    paymentMethodItems[0].classList.add('selected')
    
    paymentMethodItems.forEach(item => {
        item.addEventListener('click', () => {
            // Убираем выделение со всех методов
            paymentMethodItems.forEach(i => i.classList.remove('selected'))
            
            // Добавляем выделение на выбранный метод
            item.classList.add('selected')
            
            // Показываем/скрываем поле для ввода названия банка
            const method = item.getAttribute('data-method')
            if (customBankWrapper) {
                if (method === 'custom') {
                    customBankWrapper.style.display = 'block'
                    // Добавляем плавную анимацию появления
                    setTimeout(() => {
                        customBankWrapper.style.opacity = '1'
                        customBankWrapper.style.transform = 'translateY(0)'
                    }, 10)
                } else {
                    customBankWrapper.style.display = 'none'
                    customBankWrapper.style.opacity = '0'
                    customBankWrapper.style.transform = 'translateY(-10px)'
                }
            }
        })
    })
}

// Инициализация payment method selection
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPaymentMethodSelection)
} else {
    initPaymentMethodSelection()
}

// Preview Screen Logic
function initPreviewScreen() {
    const nextBtn = document.querySelector('#next-btn')
    const backBtn = document.querySelector('#back-from-preview')
    const createListingBtn = document.querySelector('#create-listing-btn')
    const createAdsScreen = document.querySelector('.create_ads_screen')
    const previewScreen = document.querySelector('.preview_screen')
    
    if (!nextBtn || !backBtn || !createListingBtn || !createAdsScreen || !previewScreen) {
        console.warn('Preview screen elements not found')
        return
    }
    
    // Обработка кнопки "Далее"
    nextBtn.addEventListener('click', () => {
        // Собираем данные из формы
        const action = document.querySelector('.segmented_btn--active')?.getAttribute('data-action') || 'sell'
        const crypto = document.querySelector('#selected-crypto')?.textContent || 'USDT'
        const price = document.querySelector('#price-range')?.value || '0.00'
        const amount = document.querySelector('#amount-range')?.value || '0'
        const minLimit = document.querySelector('#min-limit')?.value || '100'
        const maxLimit = document.querySelector('#max-limit')?.value || '1,000,000'
        
        // Собираем данные о реквизитах (только для продажи)
        let paymentMethod = ''
        let paymentDetails = ''
        
        if (action === 'sell') {
            const selectedMethod = document.querySelector('.payment_method_item.selected')
            if (selectedMethod) {
                const methodType = selectedMethod.getAttribute('data-method')
                
                // Если выбран пользовательский банк, берем название из поля ввода
                if (methodType === 'custom') {
                    const customBankName = document.querySelector('#custom-bank-name')?.value
                    paymentMethod = customBankName || 'Другой банк'
                } else {
                    const methodName = selectedMethod.querySelector('.payment_method_name')?.textContent || ''
                    paymentMethod = methodName
                }
            }
            paymentDetails = document.querySelector('#payment-details')?.value || ''
        }
        
        // Обновляем предпросмотр
        updatePreview(action, crypto, price, amount, minLimit, maxLimit, paymentMethod, paymentDetails)
        
        // Переключаем экраны
        createAdsScreen.style.display = 'none'
        previewScreen.style.display = 'block'
        
        // Прокручиваем вверх
        window.scrollTo(0, 0)
    })
    
    // Обработка кнопки "Назад"
    backBtn.addEventListener('click', () => {
        previewScreen.style.display = 'none'
        createAdsScreen.style.display = 'block'
        
        // Прокручиваем вверх
        window.scrollTo(0, 0)
    })
    
    // Обработка кнопки "Создать объявление"
    createListingBtn.addEventListener('click', async () => {
        try {
            // Проверяем токены перед запросом
            console.log('=== ПРОВЕРКА ТОКЕНОВ ПЕРЕД СОЗДАНИЕМ ОБЪЯВЛЕНИЯ ===');
            console.log('Токены в памяти:', {
                accessToken: !!accessToken,
                refreshToken: !!refreshToken
            });
            console.log('Токены в cookie:', {
                accessToken: !!getCookie('ACCESS_TOKEN'),
                refreshToken: !!getCookie('REFRESH_TOKEN')
            });
            
            // Если токенов нет, пытаемся загрузить из cookie
            if (!accessToken) {
                accessToken = getCookie('ACCESS_TOKEN');
                console.log('Access token загружен из cookie:', !!accessToken);
            }
            if (!refreshToken) {
                refreshToken = getCookie('REFRESH_TOKEN');
                console.log('Refresh token загружен из cookie:', !!refreshToken);
            }
            
            if (!accessToken) {
                alert('Ошибка: вы не авторизованы. Пожалуйста, перезагрузите страницу.');
                return;
            }
            
            // Собираем данные из формы
            const action = document.querySelector('.segmented_btn--active')?.getAttribute('data-action') || 'sell'
            const crypto = document.querySelector('#selected-crypto')?.textContent || 'USDT'
            const price = parseFloat(document.querySelector('#price-range')?.value) || 0
            const amount = parseFloat(document.querySelector('#amount-range')?.value) || 0
            const minLimit = parseFloat(document.querySelector('#min-limit')?.value) || 0
            const maxLimit = parseFloat(document.querySelector('#max-limit')?.value) || null
            
            let bankName = ''
            let paymentDetails = ''
            
            if (action === 'sell') {
                const selectedMethod = document.querySelector('.payment_method_item.selected')
                if (selectedMethod) {
                    const methodType = selectedMethod.getAttribute('data-method')
                    
                    if (methodType === 'custom') {
                        bankName = document.querySelector('#custom-bank-name')?.value || 'Другой банк'
                    } else {
                        bankName = selectedMethod.querySelector('.payment_method_name')?.textContent || ''
                    }
                }
                paymentDetails = document.querySelector('#payment-details')?.value || ''
            }
            
            // Валидация данных
            if (!crypto || price <= 0 || amount <= 0 || minLimit <= 0) {
                alert('Пожалуйста, заполните все обязательные поля')
                return
            }
            
            // Отправляем данные на сервер
            createListingBtn.textContent = 'Создание...'
            createListingBtn.disabled = true
            
            const adData = {
                action: action,
                crypto_currency: crypto,
                price: price,
                crypto_amount: amount,
                min_limit: minLimit,
                max_limit: maxLimit,
                bank_name: bankName,
                payment_details: paymentDetails
            }
            
            const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/ads`, {
                method: 'POST',
                body: JSON.stringify(adData)
            })
            
            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Ошибка создания объявления')
            }
            
            const createdAd = await response.json()
            console.log('Объявление создано успешно:', createdAd)
            
            // Анимация успеха
            createListingBtn.textContent = 'Создано! ✓'
            createListingBtn.style.background = 'linear-gradient(135deg, #00c864 0%, #00a854 100%)'
            
            // Возвращаем на главный экран через 1.5 секунды
            setTimeout(() => {
                previewScreen.style.display = 'none'
                main__screen.style.display = 'block'
                
                // Сбрасываем кнопку
                createListingBtn.textContent = 'Создать объявление'
                createListingBtn.style.background = 'linear-gradient(135deg, #00c864 0%, #00a854 100%)'
                createListingBtn.disabled = false
                
                // Очищаем форму
                document.querySelector('#price-range').value = ''
                document.querySelector('#amount-range').value = ''
                document.querySelector('#min-limit').value = ''
                document.querySelector('#max-limit').value = ''
                document.querySelector('#payment-details').value = ''
                
                window.scrollTo(0, 0)
                
                // Если пользователь на экране покупки, обновляем объявления
                if (buy_screen.style.display === 'block' || buy_screen.style.display === '') {
                    console.log('Обновляем список объявлений после создания')
                    const selectedCrypto = document.querySelector('.filter__value')?.textContent || 'TON'
                    loadAds('sell', selectedCrypto).then(ads => {
                        console.log('Объявления обновлены:', ads.length)
                        displayAds(ads)
                    })
                }
            }, 1500)
        } catch (error) {
            console.error('Ошибка при создании объявления:', error)
            alert('Ошибка создания объявления: ' + error.message)
            
            // Возвращаем кнопку в исходное состояние
            createListingBtn.textContent = 'Создать объявление'
            createListingBtn.disabled = false
        }
    })
}

// Функция обновления предпросмотра
function updatePreview(action, crypto, price, amount, minLimit, maxLimit, paymentMethod, paymentDetails) {
    // Обновляем бэдж действия
    const actionBadge = document.querySelector('#preview-action-badge')
    if (actionBadge) {
        if (action === 'buy') {
            actionBadge.textContent = 'ПОКУПКА'
            actionBadge.style.background = 'linear-gradient(135deg, rgba(0, 128, 255, 0.15) 0%, rgba(0, 102, 204, 0.15) 100%)'
            actionBadge.style.color = '#0080ff'
            actionBadge.style.borderColor = 'rgba(0, 128, 255, 0.3)'
        } else {
            actionBadge.textContent = 'ПРОДАЖА'
            actionBadge.style.background = 'linear-gradient(135deg, rgba(0, 200, 100, 0.15) 0%, rgba(0, 150, 80, 0.15) 100%)'
            actionBadge.style.color = '#00c864'
            actionBadge.style.borderColor = 'rgba(0, 200, 100, 0.3)'
        }
    }
    
    // Обновляем криптовалюту
    const previewCrypto = document.querySelector('#preview-crypto')
    if (previewCrypto) {
        previewCrypto.textContent = crypto
    }
    
    const previewPriceCrypto = document.querySelector('#preview-price-crypto')
    if (previewPriceCrypto) {
        previewPriceCrypto.textContent = crypto
    }
    
    // Обновляем цену
    const previewPriceAmount = document.querySelector('#preview-price-amount')
    if (previewPriceAmount) {
        const priceValue = price || '0.00'
        previewPriceAmount.textContent = priceValue
    }
    
    // Обновляем доступное количество
    const previewAvailableAmount = document.querySelector('#preview-available-amount')
    if (previewAvailableAmount) {
        const amountValue = amount || '0'
        previewAvailableAmount.textContent = `${amountValue} ${crypto}`
    }
    
    // Обновляем лимиты
    const previewLimits = document.querySelector('#preview-limits')
    if (previewLimits) {
        const minValue = minLimit || '100'
        const maxValue = maxLimit || '1,000,000'
        
        // Форматируем числа с разделителями
        const formatNumber = (num) => {
            if (!num) return '0'
            const number = parseFloat(num.replace(/[^\d.]/g, ''))
            return new Intl.NumberFormat('ru-RU').format(number)
        }
        
        previewLimits.textContent = `${formatNumber(minValue)} – ${formatNumber(maxValue)} RUB`
    }
    
    // Обновляем метод оплаты в предпросмотре
    const previewPaymentMethodRow = document.querySelector('.preview_detail_row:last-child .preview_detail_value')
    if (previewPaymentMethodRow && paymentMethod) {
        previewPaymentMethodRow.textContent = paymentMethod
    }
}

// Инициализация preview screen
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPreviewScreen)
} else {
    initPreviewScreen()
}

// ========== Функции для загрузки и отображения объявлений ==========

async function loadAds(adType = 'sell', cryptoCurrency = null) {
    try {
        let url = `${API_BASE_URL}/api/ads?ad_type=${adType}&status=active`
        
        if (cryptoCurrency) {
            url += `&crypto_currency=${cryptoCurrency}`
        }
        
        console.log('Загрузка объявлений:', { url, adType, cryptoCurrency })
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        })
        
        console.log('Ответ сервера:', { status: response.status, ok: response.ok })
        
        if (!response.ok) {
            const errorText = await response.text()
            console.error('Ошибка загрузки объявлений:', response.status, errorText)
            throw new Error(`Ошибка загрузки объявлений: ${response.status}`)
        }
        
        const ads = await response.json()
        console.log('Получено объявлений:', ads.length, ads)
        return ads
    } catch (error) {
        console.error('Ошибка загрузки объявлений:', error)
        return []
    }
}

function displayAds(ads) {
    console.log('displayAds вызвана с объявлениями:', ads)
    const listingsContainer = document.querySelector('.listings__container')
    
    if (!listingsContainer) {
        console.error('Контейнер для объявлений не найден! Ищем .listings__container')
        return
    }
    
    console.log('Контейнер найден, очищаем и добавляем объявления')
    
    // Очищаем контейнер
    listingsContainer.innerHTML = ''
    
    if (!ads || ads.length === 0) {
        console.log('Нет объявлений для отображения')
        listingsContainer.innerHTML = '<p style="text-align: center; color: grey; margin-top: 20px;">Объявлений пока нет</p>'
        return
    }
    
    console.log(`Отображаем ${ads.length} объявлений`)
    
    // Создаем карточки для каждого объявления
    ads.forEach(ad => {
        const cardHTML = `
            <div class="listing__card">
                <div class="listing__header">
                    <div class="listing__price">
                        <div class="price__main">${ad.price.toFixed(2)} RUB</div>
                        <div class="price__subtitle">Цена за 1 ${ad.crypto_currency}</div>
                    </div>
                    <div class="listing__actions">
                        <button class="buy__btn" data-ad-id="${ad.Id}">КУПИТЬ</button>
                    </div>
                </div>
                <div class="listing__seller">
                    <div class="seller__avatar" style="background-color: ${getRandomColor()};"></div>
                    <div class="seller__info">
                        <div class="seller__name">${ad.seller_name || 'Анонимный пользователь'}</div>
                        <div class="seller__stats">сделок: ${ad.seller_transactions || 0} • ${calculateSuccessRate(ad.seller_good_transactions, ad.seller_transactions)}%</div>
                    </div>
                </div>
                <div class="listing__details">
                    <div class="detail__row">
                        <span class="detail__label">Доступно</span>
                        <span class="detail__value">${ad.crypto_amount.toFixed(2)} ${ad.crypto_currency}</span>
                    </div>
                    <div class="detail__row">
                        <span class="detail__label">Лимиты</span>
                        <span class="detail__value">${formatNumber(ad.min_limit)} – ${ad.max_limit ? formatNumber(ad.max_limit) : formatNumber(ad.min_limit * 10)} RUB</span>
                    </div>
                    <div class="detail__row">
                        <span class="detail__label">Методы оплаты</span>
                        <span class="detail__value">${ad.bank_name || 'Не указано'}</span>
                    </div>
                </div>
            </div>
        `
        
        listingsContainer.innerHTML += cardHTML
    })
}

function getRandomColor() {
    const colors = ['#5BA3D0', '#D05B5B', '#5BD08D', '#D0A65B', '#8D5BD0', '#5BD0C4']
    return colors[Math.floor(Math.random() * colors.length)]
}

function calculateSuccessRate(good, total) {
    if (!total || total === 0) return 0
    return Math.round((good / total) * 100)
}

function formatNumber(num) {
    if (!num) return '0'
    return new Intl.NumberFormat('ru-RU').format(num)
}

// Инициализация buy screen с загрузкой объявлений
function initBuyScreen() {
    // Обработчик смены криптовалюты в фильтре
    const cryptoDropdownItems = document.querySelectorAll('.buy__screen .filter__dropdown .dropdown__item')
    cryptoDropdownItems.forEach(item => {
        const originalClickHandler = item.onclick
        
        item.addEventListener('click', async () => {
            // Даем время на обновление UI
            setTimeout(async () => {
                const crypto = item.getAttribute('data-value')
                if (crypto) {
                    // Загружаем объявления для выбранной криптовалюты
                    const ads = await loadAds('sell', crypto)
                    displayAds(ads)
                }
            }, 100)
        })
    })
}

// Инициализация buy screen
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBuyScreen)
} else {
    initBuyScreen()
}
