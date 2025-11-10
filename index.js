// API базовый URL
// ВАЖНО: Для Telegram Mini App нужен HTTPS!
// Настройте HTTPS на сервере (см. backend/HTTPS_SETUP.md)
// Временно можно использовать самоподписанный сертификат или ngrok для тестирования
// API базовый URL
// ВАЖНО: Telegram приложение может блокировать запросы к IP адресам!
// Рекомендуется использовать домен вместо IP
const API_BASE_URL = 'https://82.97.240.215';  // HTTPS с портом 8000

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
        
        // Показываем информацию из Telegram, если доступна (до аутентификации)
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const tgUser = tg.initDataUnsafe.user;
            const tempUserData = {
                username: tgUser.username,
                name: tgUser.first_name,
                balance: 0
            };
            updateUserInfo(tempUserData);
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
        
        // Обновляем информацию о пользователе на главном экране
        updateUserInfo(data);
        
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



// ========== Функции для работы с информацией о пользователе ==========

// Функция обновления информации о пользователе на главном экране
function updateUserInfo(userData) {
    // Поддержка новых и старых селекторов
    const userNameEl = document.querySelector('#user-name') || document.querySelector('.user_name');
    const userBalanceEl = document.querySelector('#user-balance');
    
    if (!userNameEl || !userBalanceEl) {
        console.warn('Элементы для отображения информации о пользователе не найдены');
        return;
    }
    
    // Обновляем имя (приоритет: username > name > tgData > дефолт)
    let displayName = 'Пользователь';
    if (userData.username) {
        displayName = userData.username;
    } else if (userData.name) {
        displayName = userData.name;
    } else if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const tgUser = tg.initDataUnsafe.user;
        displayName = tgUser.first_name || tgUser.username || displayName;
    }
    
    userNameEl.textContent = displayName;
    
    // Обновляем баланс
    const balance = userData.balance !== undefined && userData.balance !== null ? userData.balance : 0;
    userBalanceEl.textContent = parseFloat(balance).toFixed(2);
    
    // Обновляем аватар (генерируем цвет на основе имени)
    // Поддержка нового и старого селекторов
    const avatarSelectors = ['#user-avatar', '.user_avatar_small', '.avatar_circle'];
    avatarSelectors.forEach(selector => {
        const avatarEl = document.querySelector(selector);
        if (avatarEl) {
            const avatarColor = getAvatarColor(displayName);
            avatarEl.style.backgroundColor = avatarColor;
            const firstLetter = displayName.charAt(0).toUpperCase();
            avatarEl.textContent = firstLetter;
        }
    });
    
    console.log('Информация о пользователе обновлена:', { displayName, balance, userData });
}

// Функция для получения цвета аватара на основе имени
function getAvatarColor(name) {
    const colors = [
        '#5BA3D0', '#D05B5B', '#5BD08D', '#D0A65B', 
        '#8D5BD0', '#5BD0C4', '#D05B8D', '#8DD05B'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// Функция для загрузки и обновления баланса пользователя
async function refreshUserBalance() {
    try {
        // Загружаем актуальный баланс с сервера
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/auth/me`, {
            method: 'GET'
        });
        
        if (response.ok) {
            const userInfo = await response.json();
            if (userInfo && userInfo.balance !== undefined) {
                if (userData) {
                    userData.balance = userInfo.balance;
                }
                updateUserInfo(userData || userInfo);
            }
        } else {
            // В случае ошибки просто обновляем из userData
            if (userData) {
                updateUserInfo(userData);
            }
        }
    } catch (error) {
        console.error('Ошибка при обновлении баланса:', error);
        // В случае ошибки просто обновляем из userData
        if (userData) {
            updateUserInfo(userData);
        }
    }
}

// Инициализация кнопки обновления баланса
function initBalanceRefresh() {
    const refreshBtn = document.querySelector('#refresh-balance-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.style.animation = 'spin 1s linear';
            await refreshUserBalance();
            setTimeout(() => {
                refreshBtn.style.animation = '';
            }, 1000);
        });
    }
}

// Инициализация при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBalanceRefresh);
} else {
    initBalanceRefresh();
}

let main__screen = document.querySelector("#main__screen")
let buy_screen = document.querySelector(".buy__screen")
let sell_screen = document.querySelector(".sell__screen")
let create_ads_screen = document.querySelector(".create_ads_screen")
// ------------

let btn_buy_crypto = document.querySelector("#btn-for-buycrpyto")
let btn_sell_crypto = document.querySelector("#btn-for-sellcrpyto")
let btn_my_ads = document.querySelector("#my_ads")
let btn_create_ads = document.querySelector("#create_ads")
// ------------

// Функция для безопасного скрытия/показа экранов
function showScreen(screen) {
    // Скрываем все экраны
    if (main__screen) main__screen.style.display = "none"
    if (buy_screen) buy_screen.style.display = "none"
    if (sell_screen) sell_screen.style.display = "none"
    if (create_ads_screen) create_ads_screen.style.display = "none"
    
    // Показываем нужный экран
    if (screen) {
        screen.style.display = "block"
    }
}

if (btn_buy_crypto) {
    btn_buy_crypto.addEventListener("click", async () => {
        showScreen(buy_screen)
        
        console.log('Экран покупки открыт, загружаем объявления...')
        
        // Загружаем объявления при открытии экрана покупки (объявления людей, которые продают)
        const selectedCrypto = document.querySelector('.buy__screen .filter__value')?.textContent || 'TON'
        console.log('Выбранная криптовалюта:', selectedCrypto)
        
        const ads = await loadAds('sell', selectedCrypto)
        console.log('Объявления загружены, отображаем:', ads.length)
        displayAds(ads, 'buy')
    })
}

// Обработчик кнопки "Продать криптовалюту"
if (btn_sell_crypto) {
    btn_sell_crypto.addEventListener("click", async () => {
        showScreen(sell_screen)
        
        console.log('Экран продажи открыт, загружаем объявления...')
        
        // Загружаем объявления при открытии экрана продажи (объявления людей, которые покупают)
        const selectedCrypto = document.querySelector('.sell__screen .filter__value')?.textContent || 'TON'
        console.log('Выбранная криптовалюта:', selectedCrypto)
        
        const ads = await loadAds('buy', selectedCrypto)
        console.log('Объявления загружены, отображаем:', ads.length)
        displayAds(ads, 'sell')
    });
}

// Обработчик кнопки "Мои объявления"
if (btn_my_ads) {
    btn_my_ads.addEventListener("click", async () => {
        showScreen(null)
        
        const myAdsScreen = document.getElementById('my-ads-screen');
        if (myAdsScreen) {
            myAdsScreen.style.display = 'block';
            await loadMyAds('all');
        }
    });
}

// Обработчик кнопки "Создать объявление"
if (btn_create_ads) {
    btn_create_ads.addEventListener("click", () => {
        showScreen(create_ads_screen)
    });
}

// Обработчик кнопки "Назад" на экране покупки
document.addEventListener('DOMContentLoaded', () => {
    const backFromBuyBtn = document.getElementById('back-from-buy');
    if (backFromBuyBtn) {
        backFromBuyBtn.addEventListener('click', () => {
            document.querySelector('.buy__screen').style.display = 'none';
            document.getElementById('main__screen').style.display = 'block';
        });
    }
    
    // Обработчик кнопки "Назад" на экране продажи
    const backFromSellBtn = document.getElementById('back-from-sell');
    if (backFromSellBtn) {
        backFromSellBtn.addEventListener('click', () => {
            document.querySelector('.sell__screen').style.display = 'none';
            document.getElementById('main__screen').style.display = 'block';
        });
    }
    
    // Обработчик кнопки "Назад" на экране создания объявления
    const backFromCreateAdsBtn = document.getElementById('back-from-create-ads');
    if (backFromCreateAdsBtn) {
        backFromCreateAdsBtn.addEventListener('click', () => {
            document.querySelector('.create_ads_screen').style.display = 'none';
            document.getElementById('main__screen').style.display = 'block';
        });
    }
    
    // Обработчик кнопки "Назад" на экране предпросмотра
    const backFromPreviewBtn = document.getElementById('back-from-preview');
    if (backFromPreviewBtn) {
        backFromPreviewBtn.addEventListener('click', () => {
            document.querySelector('.preview_screen').style.display = 'none';
            document.querySelector('.create_ads_screen').style.display = 'block';
        });
    }
});
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
            
            // Проверка баланса для объявлений на продажу (проверка на фронтенде для UX)
            if (action === 'sell') {
                const userBalance = userData?.balance || 0;
                const requiredAmount = amount; // Количество криптовалюты, которое хотим продать
                
                if (userBalance < requiredAmount) {
                    alert(`Недостаточно средств на балансе!\nВаш баланс: ${userBalance.toFixed(2)} USDT\nТребуется: ${requiredAmount.toFixed(2)} ${crypto}`);
                    return;
                }
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
                const errorData = await response.json().catch(() => ({ detail: 'Ошибка создания объявления' }))
                const errorMessage = errorData.detail || errorData.message || 'Ошибка создания объявления'
                
                // Если ошибка связана с балансом, показываем понятное сообщение
                if (errorMessage.includes('Недостаточно средств') || errorMessage.includes('баланс')) {
                    alert(errorMessage);
                    return;
                }
                
                throw new Error(errorMessage)
            }
            
            const createdAd = await response.json()
            console.log('Объявление создано успешно:', createdAd)
            
            // Обновляем баланс пользователя (средства заморожены)
            if (action === 'sell' && userData) {
                userData.balance = (userData.balance || 0) - amount;
                updateUserInfo(userData);
            }
        
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

function displayAds(ads, action = 'buy') {
    console.log('displayAds вызвана с объявлениями:', ads, 'action:', action)
    
    // Определяем контейнер в зависимости от экрана
    let listingsContainer;
    if (action === 'buy') {
        listingsContainer = document.querySelector('.buy__screen .listings__container');
    } else {
        listingsContainer = document.querySelector('.sell__screen .listings__container');
    }
    
    if (!listingsContainer) {
        console.error('Контейнер для объявлений не найден!')
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
    
    // Определяем текст кнопки в зависимости от действия
    const buttonText = action === 'buy' ? 'КУПИТЬ' : 'ПРОДАТЬ';
    const buttonClass = action === 'buy' ? 'buy__btn' : 'sell__btn';
    
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
                        <button class="${buttonClass}" data-ad-id="${ad.Id}" data-ad-data='${JSON.stringify(ad)}' data-action="${action}">${buttonText}</button>
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

// Инициализация buy/sell screen с загрузкой объявлений
function initBuyScreen() {
    // Обработчик смены криптовалюты в фильтре покупки
    const cryptoDropdownItems = document.querySelectorAll('.buy__screen .filter__dropdown .dropdown__item')
    cryptoDropdownItems.forEach(item => {
        item.addEventListener('click', async () => {
            setTimeout(async () => {
                const crypto = item.getAttribute('data-value')
                if (crypto) {
                    // Загружаем объявления людей, которые продают
                    const ads = await loadAds('sell', crypto)
                    displayAds(ads, 'buy')
                }
            }, 100)
        })
    })
    
    // Обработчик смены криптовалюты в фильтре продажи
    const cryptoDropdownItemsSell = document.querySelectorAll('.sell__screen .filter__dropdown .dropdown__item')
    cryptoDropdownItemsSell.forEach(item => {
        item.addEventListener('click', async () => {
            setTimeout(async () => {
                const crypto = item.getAttribute('data-value')
                if (crypto) {
                    // Загружаем объявления людей, которые покупают
                    const ads = await loadAds('buy', crypto)
                    displayAds(ads, 'sell')
                }
            }, 100)
        })
    })
    
    // Инициализация фильтра криптовалюты для экрана продажи
    initCryptoFilterSell()
}

// Инициализация фильтра криптовалюты для экрана продажи
function initCryptoFilterSell() {
    let cryptoFilter = document.querySelector("#crypto-filter-sell")
    if (!cryptoFilter) return
    
    let cryptoDropdown = document.querySelector("#crypto-dropdown-sell")
    let cryptoFilterValue = cryptoFilter.querySelector(".filter__value")
    let dropdownItems = cryptoDropdown ? cryptoDropdown.querySelectorAll(".dropdown__item") : []

    // Открытие/закрытие меню
    const filterHeader = cryptoFilter.querySelector(".filter__header")
    if (filterHeader) {
        filterHeader.addEventListener("click", (e) => {
            e.stopPropagation()
            cryptoFilter.classList.toggle("filter__open")
        })
    }

    // Выбор опции из меню
    dropdownItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation()
            let value = item.getAttribute("data-value")
            
            // Обновляем выбранное значение
            if (cryptoFilterValue) {
                cryptoFilterValue.textContent = value
            }
            
            // Убираем выделение со всех элементов
            dropdownItems.forEach(i => i.classList.remove("dropdown__item--selected"))
            
            // Добавляем выделение на выбранный элемент
            item.classList.add("dropdown__item--selected")
            
            // Закрываем меню
            cryptoFilter.classList.remove("filter__open")
        })
    })

    // Закрытие меню при клике вне его
    if (!window.cryptoFilterSellClickHandler) {
        window.cryptoFilterSellClickHandler = (e) => {
            let cryptoFilter = document.querySelector("#crypto-filter-sell")
            if (cryptoFilter && !cryptoFilter.contains(e.target)) {
                cryptoFilter.classList.remove("filter__open")
            }
        }
        document.addEventListener("click", window.cryptoFilterSellClickHandler)
    }
}

// Инициализация buy screen
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBuyScreen)
} else {
    initBuyScreen()
}

// ========== ФУНКЦИОНАЛ СДЕЛОК ==========

// Глобальные переменные для текущей сделки
let selectedAd = null;
let currentTransaction = null;

// Обработчик клика на кнопку "КУПИТЬ" или "ПРОДАТЬ" в объявлении
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('buy__btn') || e.target.closest('.buy__btn') ||
        e.target.classList.contains('sell__btn') || e.target.closest('.sell__btn')) {
        const btn = e.target.classList.contains('buy__btn') || e.target.classList.contains('sell__btn') 
            ? e.target 
            : e.target.closest('.buy__btn') || e.target.closest('.sell__btn');
        const adDataStr = btn.getAttribute('data-ad-data');
        const action = btn.getAttribute('data-action') || 'buy';
        
        if (adDataStr) {
            try {
                selectedAd = JSON.parse(adDataStr);
                selectedAd.userAction = action; // Сохраняем действие пользователя
                openAdDetailsScreen(selectedAd, action);
            } catch (error) {
                console.error('Ошибка при парсинге данных объявления:', error);
            }
        }
    }
});

// Функция открытия экрана деталей объявления
function openAdDetailsScreen(ad, userAction = 'buy') {
    const detailsScreen = document.getElementById('ad-details-screen');
    const buyScreen = document.querySelector('.buy__screen');
    const sellScreen = document.querySelector('.sell__screen');
    
    if (!detailsScreen) {
        console.error('Экран деталей не найден');
        return;
    }
    
    // Скрываем экраны покупки/продажи
    if (buyScreen) {
        buyScreen.style.display = 'none';
    }
    if (sellScreen) {
        sellScreen.style.display = 'none';
    }
    
    // Обновляем заголовок в зависимости от действия
    const detailsTitle = document.querySelector('.ad_details_title');
    if (detailsTitle) {
        detailsTitle.textContent = userAction === 'buy' ? 'Детали объявления' : 'Детали объявления';
    }
    
    // Обновляем текст кнопки
    const confirmBtn = document.getElementById('confirm-purchase-btn');
    if (confirmBtn) {
        confirmBtn.textContent = userAction === 'buy' ? 'Купить' : 'Продать';
    }
    
    // Обновляем текст поля ввода
    const purchaseLabel = document.querySelector('.purchase_label');
    if (purchaseLabel) {
        purchaseLabel.textContent = userAction === 'buy' 
            ? 'Сумма покупки (USDT)' 
            : 'Сумма продажи (USDT)';
    }
    
    const purchaseInfo = document.getElementById('purchase-info');
    if (purchaseInfo && userAction === 'sell') {
        // Для продажи показываем, сколько рублей получим
        purchaseInfo.innerHTML = `<span class="purchase_info_text">Вы получите: <span id="fiat-amount">0.00</span> RUB</span>`;
    }
    
    // Заполняем данные объявления
    const adCard = document.getElementById('ad-details-card');
    if (adCard) {
        adCard.innerHTML = `
            <div class="ad_details_info">
                <div class="ad_details_row">
                    <span class="ad_details_label">Продавец:</span>
                    <span class="ad_details_value">${ad.seller_name || 'Неизвестно'}</span>
                </div>
                <div class="ad_details_row">
                    <span class="ad_details_label">Криптовалюта:</span>
                    <span class="ad_details_value">${ad.crypto_currency}</span>
                </div>
                <div class="ad_details_row">
                    <span class="ad_details_label">Цена за 1 ${ad.crypto_currency}:</span>
                    <span class="ad_details_value">${ad.price.toFixed(2)} RUB</span>
                </div>
                <div class="ad_details_row">
                    <span class="ad_details_label">Доступно:</span>
                    <span class="ad_details_value">${ad.crypto_amount.toFixed(4)} ${ad.crypto_currency}</span>
                </div>
                <div class="ad_details_row">
                    <span class="ad_details_label">Лимиты:</span>
                    <span class="ad_details_value">${ad.min_limit.toFixed(2)} - ${ad.max_limit ? ad.max_limit.toFixed(2) : '∞'} RUB</span>
                </div>
                <div class="ad_details_row">
                    <span class="ad_details_label">Способ оплаты:</span>
                    <span class="ad_details_value">${ad.bank_name || 'Не указан'}</span>
                </div>
            </div>
        `;
    }
    
    // Обновляем тип криптовалюты
    const cryptoTypeEl = document.getElementById('crypto-type');
    if (cryptoTypeEl) {
        cryptoTypeEl.textContent = ad.crypto_currency;
    }
    
    // Очищаем поле ввода суммы
    const purchaseAmountInput = document.getElementById('purchase-amount');
    if (purchaseAmountInput) {
        purchaseAmountInput.value = '';
        purchaseAmountInput.min = ad.min_limit;
        purchaseAmountInput.max = ad.max_limit || 999999;
    }
    
    // Показываем экран деталей
    detailsScreen.style.display = 'block';
    
    // Обработчик изменения суммы покупки
    if (purchaseAmountInput) {
        purchaseAmountInput.addEventListener('input', (e) => {
            updatePurchaseInfo(ad, parseFloat(e.target.value) || 0);
        });
    }
}

// Функция обновления информации о покупке/продаже
function updatePurchaseInfo(ad, usdtAmount) {
    if (!ad || usdtAmount <= 0) {
        const cryptoAmountEl = document.getElementById('crypto-amount');
        if (cryptoAmountEl) cryptoAmountEl.textContent = '0.00';
        const fiatAmountEl = document.getElementById('fiat-amount');
        if (fiatAmountEl) fiatAmountEl.textContent = '0.00';
        return;
    }
    
    const userAction = ad.userAction || 'buy';
    
    // Проверяем лимиты
    if (usdtAmount < ad.min_limit) {
        document.getElementById('purchase-info').innerHTML = 
            `<span class="purchase_info_text error">Минимальная сумма: ${ad.min_limit.toFixed(2)} USDT</span>`;
        return;
    }
    
    if (ad.max_limit && usdtAmount > ad.max_limit) {
        document.getElementById('purchase-info').innerHTML = 
            `<span class="purchase_info_text error">Максимальная сумма: ${ad.max_limit.toFixed(2)} USDT</span>`;
        return;
    }
    
    if (userAction === 'buy') {
        // Покупка: рассчитываем количество криптовалюты, которое получим
        const cryptoAmount = usdtAmount / ad.price;
        const availableCrypto = ad.crypto_amount || 0;
        
        if (cryptoAmount > availableCrypto) {
            document.getElementById('purchase-info').innerHTML = 
                `<span class="purchase_info_text error">Доступно только ${availableCrypto.toFixed(4)} ${ad.crypto_currency}</span>`;
            return;
        }
        
        document.getElementById('purchase-info').innerHTML = 
            `<span class="purchase_info_text">Вы получите: <span id="crypto-amount">${cryptoAmount.toFixed(4)}</span> <span id="crypto-type">${ad.crypto_currency}</span></span>`;
    } else {
        // Продажа: рассчитываем количество рублей, которое получим
        const fiatAmount = usdtAmount * ad.price;
        const availableCrypto = ad.crypto_amount || 0;
        
        // Проверяем, достаточно ли у нас криптовалюты для продажи
        if (usdtAmount > availableCrypto) {
            document.getElementById('purchase-info').innerHTML = 
                `<span class="purchase_info_text error">Доступно только ${availableCrypto.toFixed(4)} ${ad.crypto_currency}</span>`;
            return;
        }
        
        document.getElementById('purchase-info').innerHTML = 
            `<span class="purchase_info_text">Вы получите: <span id="fiat-amount">${fiatAmount.toFixed(2)}</span> RUB</span>`;
    }
}

// Обработчик кнопки "Купить" на экране деталей
document.addEventListener('DOMContentLoaded', () => {
    const confirmPurchaseBtn = document.getElementById('confirm-purchase-btn');
    if (confirmPurchaseBtn) {
        confirmPurchaseBtn.addEventListener('click', async () => {
            const purchaseAmount = parseFloat(document.getElementById('purchase-amount').value);
            
            if (!selectedAd) {
                alert('Ошибка: объявление не выбрано');
                return;
            }
            
            if (!purchaseAmount || purchaseAmount <= 0) {
                alert('Введите сумму покупки');
                return;
            }
            
            if (purchaseAmount < selectedAd.min_limit) {
                alert(`Минимальная сумма покупки: ${selectedAd.min_limit.toFixed(2)} USDT`);
                return;
            }
            
            if (selectedAd.max_limit && purchaseAmount > selectedAd.max_limit) {
                alert(`Максимальная сумма покупки: ${selectedAd.max_limit.toFixed(2)} USDT`);
                return;
            }
            
            // Создаем сделку
            try {
                const userAction = selectedAd.userAction || 'buy';
                let cryptoAmount, fiatAmount;
                
                if (userAction === 'buy') {
                    // Покупка: покупаем криптовалюту за фиат
                    cryptoAmount = purchaseAmount / selectedAd.price;
                    fiatAmount = purchaseAmount;
                } else {
                    // Продажа: продаем криптовалюту за фиат
                    cryptoAmount = purchaseAmount; // Количество криптовалюты, которое продаем
                    fiatAmount = purchaseAmount * selectedAd.price; // Рубли, которые получим
                }
                
                const transactionData = {
                    ad_id: selectedAd.Id,
                    crypto_currency: selectedAd.crypto_currency,
                    crypto_amount: cryptoAmount,
                    fiat_amount: fiatAmount
                };
                
                const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions`, {
                    method: 'POST',
                    body: JSON.stringify(transactionData)
                });
                
                if (!response.ok) {
                    throw new Error('Ошибка создания сделки');
                }
                
                currentTransaction = await response.json();
                
                // Открываем экран оплаты
                openPaymentScreen(selectedAd, purchaseAmount, userAction);
            } catch (error) {
                console.error('Ошибка при создании сделки:', error);
                alert('Ошибка создания сделки: ' + error.message);
            }
        });
    }
    
    // Обработчик кнопки "Назад" на экране деталей
    const backFromDetailsBtn = document.getElementById('back-from-details');
    if (backFromDetailsBtn) {
        backFromDetailsBtn.addEventListener('click', () => {
            const userAction = selectedAd?.userAction || 'buy';
            document.getElementById('ad-details-screen').style.display = 'none';
            if (userAction === 'buy') {
                document.querySelector('.buy__screen').style.display = 'block';
            } else {
                document.querySelector('.sell__screen').style.display = 'block';
            }
        });
    }
    
    // Обработчик кнопки "Назад" на экране оплаты
    const backFromPaymentBtn = document.getElementById('back-from-payment');
    if (backFromPaymentBtn) {
        backFromPaymentBtn.addEventListener('click', () => {
            document.getElementById('payment-screen').style.display = 'none';
            document.getElementById('ad-details-screen').style.display = 'block';
        });
    }
    
    // Обработчик кнопки "Я перевел средства"
    const paymentConfirmedBtn = document.getElementById('payment-confirmed-btn');
    if (paymentConfirmedBtn) {
        paymentConfirmedBtn.addEventListener('click', async () => {
            if (!selectedAd || !currentTransaction) {
                alert('Ошибка: данные сделки не найдены');
                return;
            }
            
            try {
                // Отмечаем сделку как оплаченную
                const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/${currentTransaction.id}/pay`, {
                    method: 'POST'
                });
                
                if (!response.ok) {
                    throw new Error('Ошибка подтверждения оплаты');
                }
                
                alert('Оплата подтверждена! Продавец получит уведомление.');
                // Закрываем экран оплаты и возвращаемся на главный
                document.getElementById('payment-screen').style.display = 'none';
                document.getElementById('main__screen').style.display = 'block';
                
                // Очищаем переменные
                selectedAd = null;
                currentTransaction = null;
            } catch (error) {
                console.error('Ошибка при подтверждении оплаты:', error);
                alert('Ошибка подтверждения оплаты: ' + error.message);
            }
        });
    }
    
    // Обработчик кнопки копирования реквизитов
    const copyPaymentDetailsBtn = document.getElementById('copy-payment-details');
    if (copyPaymentDetailsBtn) {
        copyPaymentDetailsBtn.addEventListener('click', () => {
            const paymentDetails = document.getElementById('payment-details').textContent;
            navigator.clipboard.writeText(paymentDetails).then(() => {
                copyPaymentDetailsBtn.textContent = 'Скопировано!';
                setTimeout(() => {
                    copyPaymentDetailsBtn.textContent = 'Скопировать реквизиты';
                }, 2000);
            });
        });
    }
});

// Функция открытия экрана оплаты
function openPaymentScreen(ad, usdtAmount, userAction = 'buy') {
    const paymentScreen = document.getElementById('payment-screen');
    const detailsScreen = document.getElementById('ad-details-screen');
    
    if (!paymentScreen) {
        console.error('Экран оплаты не найден');
        return;
    }
    
    // Скрываем экран деталей
    if (detailsScreen) {
        detailsScreen.style.display = 'none';
    }
    
    // Обновляем заголовок
    const paymentTitle = document.querySelector('.payment_title');
    if (paymentTitle) {
        paymentTitle.textContent = userAction === 'buy' ? 'Оплата' : 'Ожидание оплаты';
    }
    
    // Заполняем сумму
    const paymentAmountEl = document.getElementById('payment-amount');
    if (paymentAmountEl) {
        if (userAction === 'buy') {
            // Покупка: показываем сумму в USDT, которую нужно перевести
            paymentAmountEl.textContent = `${usdtAmount.toFixed(2)} USDT`;
        } else {
            // Продажа: показываем сумму в RUB, которую получим
            const fiatAmount = usdtAmount * ad.price;
            paymentAmountEl.textContent = `${fiatAmount.toFixed(2)} RUB`;
        }
    }
    
    // Заполняем реквизиты
    const paymentDetailsEl = document.getElementById('payment-details');
    if (paymentDetailsEl) {
        if (userAction === 'buy') {
            // Покупка: показываем реквизиты продавца для перевода
            paymentDetailsEl.innerHTML = `
                <div class="payment_detail_item">
                    <span class="payment_detail_label">Банк:</span>
                    <span class="payment_detail_value">${ad.bank_name || 'Не указан'}</span>
                </div>
                <div class="payment_detail_item">
                    <span class="payment_detail_label">Реквизиты:</span>
                    <span class="payment_detail_value">${ad.payment_details || 'Не указаны'}</span>
                </div>
            `;
        } else {
            // Продажа: показываем реквизиты покупателя для получения денег
            paymentDetailsEl.innerHTML = `
                <div class="payment_detail_item">
                    <span class="payment_detail_label">Банк:</span>
                    <span class="payment_detail_value">${ad.bank_name || 'Не указан'}</span>
                </div>
                <div class="payment_detail_item">
                    <span class="payment_detail_label">Реквизиты:</span>
                    <span class="payment_detail_value">${ad.payment_details || 'Не указаны'}</span>
                </div>
            `;
        }
    }
    
    // Обновляем текст кнопки и предупреждения
    const paymentWarning = document.querySelector('.payment_warning span');
    if (paymentWarning) {
        if (userAction === 'buy') {
            paymentWarning.textContent = 'После перевода средств нажмите "Я перевел"';
        } else {
            paymentWarning.textContent = 'Ожидайте перевода средств от покупателя';
        }
    }
    
    const paymentConfirmBtn = document.getElementById('payment-confirmed-btn');
    if (paymentConfirmBtn) {
        if (userAction === 'buy') {
            paymentConfirmBtn.textContent = 'Я перевел средства';
            paymentConfirmBtn.style.display = 'block';
        } else {
            // Для продажи кнопка не нужна, покупатель подтверждает перевод
            paymentConfirmBtn.style.display = 'none';
        }
    }
    
    // Показываем экран оплаты
    paymentScreen.style.display = 'block';
}

// ========== ЭКРАН "МОИ ОБЪЯВЛЕНИЯ" ==========

// Функция загрузки моих объявлений
async function loadMyAds(filter = 'all') {
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/ads/my`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки объявлений');
        }
        
        let ads = await response.json();
        
        // Фильтруем по типу
        if (filter !== 'all') {
            ads = ads.filter(ad => ad.action === filter);
        }
        
        displayMyAds(ads);
    } catch (error) {
        console.error('Ошибка при загрузке моих объявлений:', error);
        const myAdsList = document.getElementById('my-ads-list');
        if (myAdsList) {
            myAdsList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 40px;">Ошибка загрузки объявлений</p>';
        }
    }
}

// Функция отображения моих объявлений
function displayMyAds(ads) {
    const myAdsList = document.getElementById('my-ads-list');
    if (!myAdsList) return;
    
    myAdsList.innerHTML = '';
    
    if (!ads || ads.length === 0) {
        myAdsList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 40px;">У вас пока нет объявлений</p>';
        return;
    }
    
    ads.forEach(ad => {
        const adCard = document.createElement('div');
        adCard.className = 'my_ad_card';
        adCard.setAttribute('data-ad-id', ad.Id);
        adCard.innerHTML = `
            <div class="my_ad_header">
                <div class="my_ad_badge ${ad.action === 'buy' ? 'badge_buy' : 'badge_sell'}">
                    ${ad.action === 'buy' ? 'ПОКУПКА' : 'ПРОДАЖА'}
                </div>
                <button class="delete_ad_btn" data-ad-id="${ad.Id}" title="Удалить">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6H5H21M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            <div class="my_ad_content">
                <div class="my_ad_row">
                    <span class="my_ad_label">Криптовалюта:</span>
                    <span class="my_ad_value">${ad.crypto_currency}</span>
                </div>
                <div class="my_ad_row">
                    <span class="my_ad_label">Цена:</span>
                    <span class="my_ad_value">${ad.price.toFixed(2)} RUB</span>
                </div>
                <div class="my_ad_row">
                    <span class="my_ad_label">Количество:</span>
                    <span class="my_ad_value">${ad.crypto_amount.toFixed(4)} ${ad.crypto_currency}</span>
                </div>
                <div class="my_ad_row">
                    <span class="my_ad_label">Лимиты:</span>
                    <span class="my_ad_value">${ad.min_limit.toFixed(2)} - ${ad.max_limit ? ad.max_limit.toFixed(2) : '∞'} RUB</span>
                </div>
                <div class="my_ad_row">
                    <span class="my_ad_label">Статус:</span>
                    <span class="my_ad_value status_${ad.status || 'active'}">${ad.status === 'active' ? 'Активно' : ad.status || 'Активно'}</span>
                </div>
            </div>
        `;
        
        myAdsList.appendChild(adCard);
    });
    
    // Добавляем обработчики удаления
    document.querySelectorAll('.delete_ad_btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const adId = btn.getAttribute('data-ad-id');
            if (confirm('Вы уверены, что хотите удалить это объявление?')) {
                await deleteAd(adId);
            }
        });
    });
}

// Функция удаления объявления
async function deleteAd(adId) {
    try {
        // Получаем данные объявления перед удалением для обновления баланса
        const myAdsList = document.getElementById('my-ads-list');
        const adCard = myAdsList?.querySelector(`[data-ad-id="${adId}"]`)?.closest('.my_ad_card');
        let adData = null;
        
        if (adCard) {
            // Пытаемся извлечь данные из карточки
            const adType = adCard.querySelector('.badge_buy') ? 'buy' : 'sell';
            // Ищем строку с количеством криптовалюты
            const rows = adCard.querySelectorAll('.my_ad_row');
            let cryptoAmount = 0;
            rows.forEach(row => {
                const label = row.querySelector('.my_ad_label')?.textContent;
                if (label && label.includes('Количество')) {
                    const valueText = row.querySelector('.my_ad_value')?.textContent || '';
                    cryptoAmount = parseFloat(valueText.split(' ')[0]) || 0;
                }
            });
            adData = { action: adType, crypto_amount: cryptoAmount };
        }
        
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/ads/${adId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка удаления объявления');
        }
        
        // Если это было объявление на продажу, обновляем баланс (средства разморожены)
        if (adData && adData.action === 'sell' && adData.crypto_amount && userData) {
            userData.balance = (userData.balance || 0) + adData.crypto_amount;
            updateUserInfo(userData);
        }
        
        // Обновляем список объявлений
        const activeFilter = document.querySelector('.filter_tab.active')?.getAttribute('data-filter') || 'all';
        await loadMyAds(activeFilter);
        
        // Показываем уведомление
        alert('Объявление удалено');
    } catch (error) {
        console.error('Ошибка при удалении объявления:', error);
        alert('Ошибка удаления объявления: ' + error.message);
    }
}

// Инициализация фильтров "Мои объявления"
document.addEventListener('DOMContentLoaded', () => {
    const filterTabs = document.querySelectorAll('.filter_tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            // Убираем активный класс у всех
            filterTabs.forEach(t => t.classList.remove('active'));
            // Добавляем активный класс текущему
            tab.classList.add('active');
            
            // Загружаем объявления с выбранным фильтром
            const filter = tab.getAttribute('data-filter');
            await loadMyAds(filter);
        });
    });
    
    // Обработчик кнопки "Назад" на экране "Мои объявления"
    const backFromMyAdsBtn = document.getElementById('back-from-my-ads');
    if (backFromMyAdsBtn) {
        backFromMyAdsBtn.addEventListener('click', () => {
            document.getElementById('my-ads-screen').style.display = 'none';
            document.getElementById('main__screen').style.display = 'block';
        });
    }
    
    // Обработчик кнопки уведомлений
    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', async () => {
            document.getElementById('main__screen').style.display = 'none';
            document.getElementById('notifications-screen').style.display = 'block';
            await loadPendingTransactions();
        });
    }
    
    // Обработчик кнопки "Назад" на экране уведомлений
    const backFromNotificationsBtn = document.getElementById('back-from-notifications');
    if (backFromNotificationsBtn) {
        backFromNotificationsBtn.addEventListener('click', () => {
            document.getElementById('notifications-screen').style.display = 'none';
            document.getElementById('main__screen').style.display = 'block';
        });
    }
    
    // Периодическая проверка уведомлений (каждые 30 секунд)
    setInterval(async () => {
        await checkPendingTransactions();
    }, 30000);
    
    // Первоначальная проверка
    checkPendingTransactions();
});

// ========== ФУНКЦИИ ДЛЯ УВЕДОМЛЕНИЙ ==========

// Функция проверки ожидающих сделок
async function checkPendingTransactions() {
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/pending`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            return;
        }
        
        const transactions = await response.json();
        const badge = document.getElementById('notifications-badge');
        
        if (transactions && transactions.length > 0) {
            if (badge) {
                badge.textContent = transactions.length;
                badge.style.display = 'flex';
            }
        } else {
            if (badge) {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Ошибка при проверке уведомлений:', error);
    }
}

// Функция загрузки ожидающих сделок
async function loadPendingTransactions() {
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/pending`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки уведомлений');
        }
        
        const transactions = await response.json();
        displayPendingTransactions(transactions);
    } catch (error) {
        console.error('Ошибка при загрузке уведомлений:', error);
        const notificationsList = document.getElementById('notifications-list');
        if (notificationsList) {
            notificationsList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 40px;">Ошибка загрузки уведомлений</p>';
        }
    }
}

// Функция отображения ожидающих сделок
function displayPendingTransactions(transactions) {
    const notificationsList = document.getElementById('notifications-list');
    if (!notificationsList) return;
    
    notificationsList.innerHTML = '';
    
    if (!transactions || transactions.length === 0) {
        notificationsList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 40px;">Нет ожидающих подтверждения сделок</p>';
        return;
    }
    
    transactions.forEach(transaction => {
        const notificationCard = document.createElement('div');
        notificationCard.className = 'notification_card';
        notificationCard.innerHTML = `
            <div class="notification_header">
                <div class="notification_badge_new">Новое</div>
                <div class="notification_time">${new Date(transaction.buyer_paid_at).toLocaleString('ru-RU')}</div>
            </div>
            <div class="notification_content">
                <div class="notification_text">
                    Покупатель перевел <strong>${transaction.fiat_amount.toFixed(2)} USDT</strong>
                </div>
                <div class="notification_details">
                    <div class="notification_detail_row">
                        <span>Криптовалюта:</span>
                        <span>${transaction.crypto_amount.toFixed(4)} ${transaction.crypto_currency}</span>
                    </div>
                    <div class="notification_detail_row">
                        <span>Цена:</span>
                        <span>${transaction.price.toFixed(2)} RUB</span>
                    </div>
                </div>
            </div>
            <div class="notification_actions">
                <button class="notification_confirm_btn" data-transaction-id="${transaction.id}">
                    Подтвердить получение
                </button>
            </div>
        `;
        
        notificationsList.appendChild(notificationCard);
    });
    
    // Добавляем обработчики кнопок подтверждения
    document.querySelectorAll('.notification_confirm_btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const transactionId = parseInt(btn.getAttribute('data-transaction-id'));
            await confirmTransaction(transactionId);
        });
    });
}

// Функция подтверждения сделки продавцом
async function confirmTransaction(transactionId) {
    if (!confirm('Вы подтверждаете получение денег от покупателя?')) {
        return;
    }
    
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/${transactionId}/confirm`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка подтверждения сделки');
        }
        
        alert('Сделка подтверждена! Криптовалюта переведена покупателю.');
        
        // Обновляем список уведомлений
        await loadPendingTransactions();
        
        // Обновляем счетчик уведомлений
        await checkPendingTransactions();
        
        // Обновляем баланс пользователя
        if (userData) {
            await refreshUserBalance();
        }
    } catch (error) {
        console.error('Ошибка при подтверждении сделки:', error);
        alert('Ошибка подтверждения сделки: ' + error.message);
    }
}
