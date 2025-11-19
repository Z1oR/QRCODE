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
        // Если в ответе нет id, получаем его из /api/auth/me
        userData = data;
        if (!userData.id) {
            try {
                const meResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/api/auth/me`, {
                    method: 'GET'
                });
                if (meResponse.ok) {
                    const meData = await meResponse.json();
                    userData.id = meData.id;
                    userData.username = userData.username || meData.username;
                    userData.balance = userData.balance !== undefined ? userData.balance : meData.balance;
                    userData.is_admin = meData.is_admin || false;
                }
            } catch (error) {
                console.error('Ошибка при получении ID пользователя:', error);
            }
        }
        
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
        
        // Пытаемся пройти аутентификацию заново, если токенов нет
        console.log('Попытка повторной аутентификации...');
        try {
            await authenticateWithTelegram();
            // После аутентификации получаем токен снова
            token = accessToken || getCookie('ACCESS_TOKEN');
            if (token) {
                defaultOptions.headers['Authorization'] = `Bearer ${token}`;
                console.log('Токен получен после повторной аутентификации');
            } else {
                console.error('Не удалось получить токен после повторной аутентификации');
                const errorResponse = new Response(JSON.stringify({ error: 'Требуется аутентификация' }), {
                    status: 401,
                    statusText: 'Unauthorized',
                    headers: { 'Content-Type': 'application/json' }
                });
                return errorResponse;
            }
        } catch (authError) {
            console.error('Ошибка при повторной аутентификации:', authError);
            const errorResponse = new Response(JSON.stringify({ error: 'Требуется аутентификация. Пожалуйста, обновите страницу.' }), {
                status: 401,
                statusText: 'Unauthorized',
                headers: { 'Content-Type': 'application/json' }
            });
            return errorResponse;
        }
    }

    const response = await fetch(url, { ...defaultOptions, ...options });
    
    // Если получили 401, токены могли истечь - пытаемся обновить
    if (response.status === 401) {
        console.log('Получен 401, пытаемся обновить токен...');
        try {
            // Получаем refresh token
            const refreshTokenValue = refreshToken || getCookie('REFRESH_TOKEN');
            
            console.log('Проверка refresh token:', {
                hasRefreshToken: !!refreshToken,
                hasCookieRefreshToken: !!getCookie('REFRESH_TOKEN'),
                refreshTokenValue: !!refreshTokenValue
            });
            
            if (!refreshTokenValue) {
                console.error('Refresh token не найден, пытаемся пройти аутентификацию заново...');
                // Если refresh token нет, пытаемся пройти аутентификацию заново
                try {
                    await authenticateWithTelegram();
                    const newToken = accessToken || getCookie('ACCESS_TOKEN');
                    if (newToken) {
                        // Создаем новый объект options с обновленным токеном
                        const retryOptions = {
                            method: options.method || 'GET',
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/json',
                                ...options.headers,
                                'Authorization': `Bearer ${newToken}`
                            }
                        };
                        
                        // Копируем body, если он есть
                        if (options.body) {
                            retryOptions.body = options.body;
                        }
                        
                        console.log('Токен получен после повторной аутентификации, повторяем запрос');
                        return await fetch(url, retryOptions);
                    }
                } catch (authError) {
                    console.error('Ошибка при повторной аутентификации:', authError);
                }
                return response;
            }
            
            console.log('Отправка запроса на обновление токена...');
            const refreshResponse = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${refreshTokenValue}`
                }
            });
            
            console.log('Ответ на обновление токена:', refreshResponse.status);
            
            if (refreshResponse.ok) {
                const tokenData = await refreshResponse.json();
                console.log('Токены получены от сервера:', {
                    hasAccessToken: !!tokenData.access_token,
                    hasRefreshToken: !!tokenData.refresh_token
                });
                
                // Обновляем токены
                accessToken = tokenData.access_token;
                refreshToken = tokenData.refresh_token;
                
                console.log('Токены обновлены в памяти, повторяем запрос');
                console.log('Новый access token (первые 20 символов):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');
                
                // Создаем новый объект options с обновленным токеном
                // Важно: создаем новый объект, чтобы не мутировать старый
                const retryOptions = {
                    method: options.method || defaultOptions.method || 'GET',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers,
                        'Authorization': `Bearer ${accessToken}`
                    }
                };
                
                // Копируем body, если он есть
                if (options.body) {
                    retryOptions.body = options.body;
                }
                
                console.log('Повторный запрос с новым токеном:', {
                    url,
                    method: retryOptions.method,
                    hasAuthorization: !!retryOptions.headers['Authorization'],
                    authorizationLength: retryOptions.headers['Authorization'] ? retryOptions.headers['Authorization'].length : 0,
                    hasBody: !!retryOptions.body,
                    bodyType: typeof retryOptions.body
                });
                
                const retryResponse = await fetch(url, retryOptions);
                
                console.log('Ответ на повторный запрос:', retryResponse.status);
                
                if (retryResponse.ok) {
                    console.log('Запрос успешно выполнен после обновления токена');
                } else {
                    console.error('Запрос все еще не прошел после обновления токена:', retryResponse.status);
                    const errorText = await retryResponse.text().catch(() => '');
                    console.error('Текст ошибки:', errorText);
                }
                
                return retryResponse;
            } else {
                const errorText = await refreshResponse.text();
                console.error('Ошибка обновления токена:', refreshResponse.status, errorText);
                
                // Если refresh token тоже не работает, пытаемся пройти аутентификацию заново
                console.log('Попытка повторной аутентификации после неудачного обновления токена...');
                try {
                    await authenticateWithTelegram();
                    const newToken = accessToken || getCookie('ACCESS_TOKEN');
                    if (newToken) {
                        const retryOptions = {
                            method: options.method || 'GET',
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/json',
                                ...options.headers,
                                'Authorization': `Bearer ${newToken}`
                            }
                        };
                        
                        // Копируем body, если он есть
                        if (options.body) {
                            retryOptions.body = options.body;
                        }
                        
                        console.log('Токен получен после повторной аутентификации, повторяем запрос');
                        return await fetch(url, retryOptions);
                    }
                } catch (authError) {
                    console.error('Ошибка при повторной аутентификации:', authError);
                }
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
                    userData.is_admin = userInfo.is_admin || false;
                } else {
                    userData = userInfo;
                }
                updateUserInfo(userData || userInfo);
                
                // Проверяем права администратора и показываем кнопку
                if (userInfo.is_admin) {
                    checkAdminAccess();
                }
                
                // Обновляем баланс на экране создания объявления, если он открыт
                const createAdsScreen = document.querySelector('.create_ads_screen');
                if (createAdsScreen && createAdsScreen.style.display !== 'none') {
                    updateCreateAdBalance();
                }
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

// Обработчик кнопки "Мои сделки"
const btn_my_transactions = document.getElementById('my_transactions');
if (btn_my_transactions) {
    btn_my_transactions.addEventListener("click", async () => {
        showScreen(null);
        
        const myTransactionsScreen = document.getElementById('my-transactions-screen');
        if (myTransactionsScreen) {
            myTransactionsScreen.style.display = 'block';
            await loadMyTransactions();
        }
    });
}

// Обработчик кнопки "О нас"
const btn_about_us = document.getElementById('about_us');
if (btn_about_us) {
    btn_about_us.addEventListener("click", () => {
        showScreen(null);
        
        const aboutScreen = document.getElementById('about-screen');
        if (aboutScreen) {
            aboutScreen.style.display = 'block';
        }
    });
}

// Обработчик кнопки "Назад" на экране сделок
const backFromTransactionsBtn = document.getElementById('back-from-transactions');
if (backFromTransactionsBtn) {
    backFromTransactionsBtn.addEventListener('click', () => {
        const myTransactionsScreen = document.getElementById('my-transactions-screen');
        if (myTransactionsScreen) {
            myTransactionsScreen.style.display = 'none';
        }
        const mainScreen = document.getElementById('main__screen');
        if (mainScreen) {
            mainScreen.style.display = 'block';
        }
    });
}

// Обработчик кнопки "Назад" на экране деталей сделки
const backFromTransactionDetailsBtn = document.getElementById('back-from-transaction-details');
if (backFromTransactionDetailsBtn) {
    backFromTransactionDetailsBtn.addEventListener('click', () => {
        const transactionDetailsScreen = document.getElementById('transaction-details-screen');
        if (transactionDetailsScreen) {
            transactionDetailsScreen.style.display = 'none';
        }
        const myTransactionsScreen = document.getElementById('my-transactions-screen');
        if (myTransactionsScreen) {
            myTransactionsScreen.style.display = 'block';
        }
    });
}

// Обработчик кнопки "Создать объявление"
if (btn_create_ads) {
    btn_create_ads.addEventListener("click", async () => {
        showScreen(create_ads_screen)
        // Обновляем баланс при открытии экрана создания объявления
        await refreshUserBalance()
        updateCreateAdBalance()
    });
}

// Функция обновления баланса на экране создания объявления
function updateCreateAdBalance() {
    const balanceAmountEl = document.getElementById('balance-amount')
    const balanceCryptoEl = document.getElementById('balance-crypto')
    
    if (balanceAmountEl && userData) {
        const balance = userData.balance !== undefined && userData.balance !== null ? userData.balance : 0
        balanceAmountEl.textContent = parseFloat(balance).toFixed(2)
    }
    
    // Обновляем тип криптовалюты в балансе
    if (balanceCryptoEl) {
        const selectedCrypto = document.querySelector('#selected-crypto')?.textContent || 'USDT'
        balanceCryptoEl.textContent = selectedCrypto
    }
}

// Функция обновления максимального лимита при изменении цены или количества
function updateMaxLimit() {
    const priceInput = document.querySelector('#price-range')
    const amountInput = document.querySelector('#amount-range')
    const maxLimitInput = document.querySelector('#max-limit')
    
    if (priceInput && amountInput && maxLimitInput) {
        const price = parseFloat(priceInput.value) || 0
        const amount = parseFloat(amountInput.value) || 0
        const calculatedMax = price * amount
        
        if (calculatedMax > 0) {
            maxLimitInput.value = formatNumber(calculatedMax)
        } else {
            maxLimitInput.value = ''
        }
    }
}

// Инициализация кнопки "Макс." и обновления баланса
function initMaxAmountButton() {
    const maxAmountBtn = document.getElementById('max-amount-btn')
    const amountRangeInput = document.getElementById('amount-range')
    const priceRangeInput = document.getElementById('price-range')
    
    // Обновляем максимальный лимит при изменении цены или количества
    if (priceRangeInput) {
        priceRangeInput.addEventListener('input', updateMaxLimit)
    }
    if (amountRangeInput) {
        amountRangeInput.addEventListener('input', updateMaxLimit)
    }
    
    if (maxAmountBtn && amountRangeInput) {
        maxAmountBtn.addEventListener('click', () => {
            if (userData && userData.balance !== undefined && userData.balance !== null) {
                const balance = parseFloat(userData.balance) || 0
                // Устанавливаем максимальное значение равное балансу
                amountRangeInput.value = balance.toFixed(2)
                
                // Обновляем максимальный лимит
                updateMaxLimit()
                
                // Триггерим событие input для обновления UI
                amountRangeInput.dispatchEvent(new Event('input', { bubbles: true }))
            } else {
                // Если баланс не загружен, пытаемся обновить
                refreshUserBalance().then(() => {
                    if (userData && userData.balance !== undefined && userData.balance !== null) {
                        const balance = parseFloat(userData.balance) || 0
                        amountRangeInput.value = balance.toFixed(2)
                        updateMaxLimit()
                        amountRangeInput.dispatchEvent(new Event('input', { bubbles: true }))
                    }
                })
            }
        })
    }
}

// Инициализация при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initMaxAmountButton()
    })
} else {
    initMaxAmountButton()
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
            showScreen(main__screen);
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
            
            // Обновляем баланс на экране создания объявления
            updateCreateAdBalance()
            
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
        const price = parseFloat(document.querySelector('#price-range')?.value) || 0
        const amount = parseFloat(document.querySelector('#amount-range')?.value) || 0
        const minLimit = document.querySelector('#min-limit')?.value || '100'
        // Автоматически рассчитываем максимальный лимит
        const calculatedMaxLimit = price * amount
        const maxLimit = calculatedMaxLimit > 0 ? formatNumber(calculatedMaxLimit) : '1,000,000'
        
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
            paymentDetails = document.querySelector('#payment-details2')?.value || ''
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
            // Автоматически рассчитываем максимальный лимит: курс * количество
            const calculatedMaxLimit = price * amount;
            // Если пользователь указал max-limit, используем его, иначе используем рассчитанный
            const userMaxLimit = document.querySelector('#max-limit')?.value;
            const maxLimit = userMaxLimit && userMaxLimit.trim() !== '' 
                ? parseFloat(userMaxLimit.replace(/[^\d.]/g, '')) 
                : calculatedMaxLimit;
            
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
                paymentDetails = document.querySelector('#payment-details2')?.value || ''
            }
            
            // Валидация данных
            if (!crypto || price <= 0 || amount <= 0 || minLimit <= 0) {
                alert('Пожалуйста, заполните все обязательные поля')
                return
            }
            
            // Валидация метода оплаты и реквизитов для объявлений на продажу
            if (action === 'sell') {
                if (!bankName || !paymentDetails) {
                    alert('Пожалуйста, выберите метод оплаты и укажите реквизиты для получения платежей')
                    return
                }
                
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
        setTimeout(async () => {
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
                document.querySelector('#payment-details2').value = ''
                
                // Обновляем баланс после создания объявления
                await refreshUserBalance()
            
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
                        <span class="detail__value">${ad.crypto_amount.toFixed(1)} ${ad.crypto_currency}</span>
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
    const number = typeof num === 'string' ? parseFloat(num.replace(/[^\d.]/g, '')) : num
    return new Intl.NumberFormat('ru-RU').format(number)
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
                console.log('Данные объявления при открытии деталей:', selectedAd);
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
        if (userAction === 'buy') {
            purchaseLabel.textContent = 'Сумма покупки';
        } else {
            purchaseLabel.textContent = 'Сумма продажи';
        }
    }
    
    // Инициализируем переключатель валюты
    const toggleRub = document.getElementById('toggle-rub');
    const toggleCrypto = document.getElementById('toggle-crypto');
    const toggleCryptoText = document.getElementById('toggle-crypto-text');
    const purchaseCurrency = document.getElementById('purchase-currency');
    
    let currentCurrencyMode = 'RUB';

    if (toggleCryptoText) {
        toggleCryptoText.textContent = ad.crypto_currency;
    }





    // Обработчики переключателя валюты
    if (toggleRub && toggleCrypto) {
        // Удаляем старые обработчики
        const newToggleRub = toggleRub.cloneNode(true);
        const newToggleCrypto = toggleCrypto.cloneNode(true);
        toggleRub.parentNode.replaceChild(newToggleRub, toggleRub);
        toggleCrypto.parentNode.replaceChild(newToggleCrypto, toggleCrypto);
        
        newToggleRub.addEventListener('click', () => {
            currentCurrencyMode = 'RUB';
            newToggleRub.classList.add('active');
            newToggleCrypto.classList.remove('active');
            if (purchaseCurrency) purchaseCurrency.textContent = 'RUB';
            
            // Обновляем лимиты и значение
            const purchaseAmountInput = document.getElementById('purchase-amount');
            if (purchaseAmountInput) {
                const currentValue = parseFloat(purchaseAmountInput.value) || 0;
                if (currentValue > 0) {
                    // Конвертируем из криптовалюты в рубли
                    const rubValue = currentValue * ad.price;
                    purchaseAmountInput.value = rubValue.toFixed(2);
                    purchaseAmountInput.min = ad.min_limit || 0;
                    purchaseAmountInput.max = ad.max_limit || 999999;
                    updatePurchaseInfo(ad, rubValue, 'RUB');
                } else {
                    purchaseAmountInput.min = ad.min_limit || 0;
                    purchaseAmountInput.max = ad.max_limit || 999999;
                }
            }
        });
        
        newToggleCrypto.addEventListener('click', () => {
            currentCurrencyMode = 'CRYPTO';
            newToggleCrypto.classList.add('active');
            newToggleRub.classList.remove('active');
            if (purchaseCurrency) purchaseCurrency.textContent = ad.crypto_currency;
            
            // Обновляем лимиты и значение
            const purchaseAmountInput = document.getElementById('purchase-amount');
            if (purchaseAmountInput) {
                const currentValue = parseFloat(purchaseAmountInput.value) || 0;
                if (currentValue > 0) {
                    // Конвертируем из рублей в криптовалюту
                    const cryptoValue = currentValue / ad.price;
                    purchaseAmountInput.value = cryptoValue.toFixed(6);
                    const minLimit = ad.min_limit || 0;
                    const maxLimit = ad.max_limit;
                    purchaseAmountInput.min = minLimit / ad.price;
                    purchaseAmountInput.max = maxLimit ? maxLimit / ad.price : 999999;
                    updatePurchaseInfo(ad, cryptoValue, 'CRYPTO');
                } else {
                    const minLimit = ad.min_limit || 0;
                    const maxLimit = ad.max_limit;
                    purchaseAmountInput.min = minLimit / ad.price;
                    purchaseAmountInput.max = maxLimit ? maxLimit / ad.price : 999999;
                }
            }
        });
    }
    
    const purchaseInfo = document.getElementById('purchase-info');
    if (purchaseInfo && userAction === 'buy') {
        // Для покупки показываем, сколько криптовалюты получим
        purchaseInfo.innerHTML = `<span class="purchase_info_text">Вы получите: <span id="crypto-amount">0.00</span> <span id="crypto-type">${ad.crypto_currency}</span></span>`;
    } else if (purchaseInfo && userAction === 'sell') {
        // Для продажи показываем, сколько рублей получим
        purchaseInfo.innerHTML = `<span class="purchase_info_text">Вы получите: <span id="fiat-amount">0.00</span> RUB</span>`;
    }
    
    // Показываем/скрываем форму реквизитов в зависимости от действия
    const buyerPaymentDetailsSection = document.getElementById('buyer-payment-details-section');
    const buyerBankNameInput = document.getElementById('buyer-bank-name');
    const buyerPaymentDetailsInput = document.getElementById('buyer-payment-details');
    
    // Очищаем поля реквизитов покупателя
    if (buyerBankNameInput) {
        buyerBankNameInput.value = '';
        buyerBankNameInput.classList.remove('error');
        // Убираем класс ошибки при вводе
        buyerBankNameInput.addEventListener('input', () => {
            buyerBankNameInput.classList.remove('error');
        });
    }
    if (buyerPaymentDetailsInput) {
        buyerPaymentDetailsInput.value = '';
        buyerPaymentDetailsInput.classList.remove('error');
        // Убираем класс ошибки при вводе
        buyerPaymentDetailsInput.addEventListener('input', () => {
            buyerPaymentDetailsInput.classList.remove('error');
        });
    }
    
    // Форма реквизитов покупателя больше не нужна - реквизиты берутся из объявления
    if (buyerPaymentDetailsSection) {
        buyerPaymentDetailsSection.style.display = 'none';
    }
    
    // Показываем/скрываем форму реквизитов продавца при продаже
    const sellerPaymentDetailsSection = document.getElementById('seller-payment-details-section');
    const sellerBankNameInput = document.getElementById('seller-bank-name');
    const sellerPaymentDetailsInput = document.getElementById('seller-payment-details');
    
    if (sellerPaymentDetailsSection) {
        if (userAction === 'sell') {
            // Показываем поля реквизитов для продавца
            sellerPaymentDetailsSection.style.display = 'block';
        } else {
            // Скрываем при покупке
            sellerPaymentDetailsSection.style.display = 'none';
        }
    }
    
    // Очищаем поля реквизитов продавца
    if (sellerBankNameInput) {
        sellerBankNameInput.value = '';
        sellerBankNameInput.classList.remove('error');
        sellerBankNameInput.addEventListener('input', () => {
            sellerBankNameInput.classList.remove('error');
        });
    }
    if (sellerPaymentDetailsInput) {
        sellerPaymentDetailsInput.value = '';
        sellerPaymentDetailsInput.classList.remove('error');
        sellerPaymentDetailsInput.addEventListener('input', () => {
            sellerPaymentDetailsInput.classList.remove('error');
        });
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
                    <span class="ad_details_value">${ad.crypto_amount.toFixed(1)} ${ad.crypto_currency}</span>
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
    
    // Устанавливаем данные о балансе пользователя и лимитах для продажи
    if (userAction === 'sell') {
        // Обновляем баланс перед установкой, если он не актуален
        if (!userData || userData.balance === undefined) {
            refreshUserBalance().then(() => {
                ad.user_crypto = userData?.balance || 0;
            });
        } else {
            ad.user_crypto = userData.balance;
        }
        // Используем лимиты для продажи, если они есть, иначе обычные лимиты
        ad.sell_min_limit = ad.sell_min_limit || ad.min_limit || 0;
        ad.sell_max_limit = ad.sell_max_limit || ad.max_limit;
    }
    
    // Очищаем поле ввода суммы
    const purchaseAmountInput = document.getElementById('purchase-amount');
    if (purchaseAmountInput) {
        purchaseAmountInput.value = '';
        
        if (userAction === 'buy') {
            // Для покупки: по умолчанию вводим рубли
            purchaseAmountInput.min = ad.min_limit || 0;
            purchaseAmountInput.max = ad.max_limit || 999999;
            if (purchaseCurrency) purchaseCurrency.textContent = 'RUB';
        } else {
            // Для продажи: вводим количество криптовалюты, лимиты конвертируем в криптовалюту
            const minLimit = ad.sell_min_limit || ad.min_limit || 0;
            const maxLimit = ad.sell_max_limit || ad.max_limit;
            purchaseAmountInput.min = minLimit / ad.price;
            purchaseAmountInput.max = maxLimit ? maxLimit / ad.price : 999999;
            if (purchaseCurrency) purchaseCurrency.textContent = ad.crypto_currency;
            // Для продажи скрываем переключатель валюты (всегда вводим криптовалюту)
            if (toggleRub && toggleCrypto) {
                toggleRub.style.display = 'none';
                toggleCrypto.style.display = 'none';
            }
            // Для продажи форма реквизитов уже показана выше
        }
    }
    
    // Показываем экран деталей
    detailsScreen.style.display = 'block';
    
    // Обработчик изменения суммы покупки/продажи
    if (purchaseAmountInput) {
        // Удаляем старые обработчики, если они есть
        const newInput = purchaseAmountInput.cloneNode(true);
        purchaseAmountInput.parentNode.replaceChild(newInput, purchaseAmountInput);
        
        newInput.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value) || 0;
            if (userAction === 'buy') {
                // Для покупки: используем текущий режим валюты
                updatePurchaseInfo(ad, value, currentCurrencyMode);
            } else {
                // Для продажи: value в криптовалюте
                updatePurchaseInfo(ad, value, 'CRYPTO');
            }
        });
    }
    
    // Сохраняем режим валюты в объекте ad для использования в других функциях
    // Используем замыкание для доступа к currentCurrencyMode
    const updateCurrencyMode = (mode) => {
        ad.currencyMode = mode;
    };
    
    // Режим валюты уже сохранен в обработчиках выше
    
    // Сохраняем функцию для обновления режима
    ad.updateCurrencyMode = updateCurrencyMode;
    ad.currencyMode = currentCurrencyMode;
}

// Функция обновления информации о покупке/продаже
// amount - введенная сумма
// currencyMode - 'RUB' или 'CRYPTO' (только для покупки)
function updatePurchaseInfo(ad, amount, currencyMode = 'RUB') {
    const out = document.getElementById('purchase-info');

    // Если нет данных или сумма <= 0 — очистка
    if (!ad || amount <= 0) {
        out.innerHTML = `<span class="purchase_info_text">Введите сумму</span>`;
        return;
    }

    const userAction = ad.userAction; // 'buy' или 'sell'

    //
    // === КОНВЕРТАЦИЯ СУММЫ ===
    //
    let rubAmount;
    let cryptoAmount;

    if (currencyMode === 'RUB') {
        rubAmount = amount;
        cryptoAmount = amount / ad.price;
    } else {
        cryptoAmount = amount;
        rubAmount = amount * ad.price;
    }

    //
    // === ЗНАЧЕНИЯ ДЛЯ BUY И SELL РАЗНЫЕ ===
    //

    // 🔵 ПОКУПКА
    if (userAction === 'buy') {

        const minLimit = ad.min_limit || 0;  // лимиты объявления продавца
        const maxLimit = ad.max_limit;
        const availableCrypto = ad.crypto_amount || 0; // крипта продавца

        // --- проверки ---
        if (minLimit > 0 && rubAmount < minLimit) {
            return out.innerHTML =
                `<span class="purchase_info_text error">
                    Минимальная сумма: ${minLimit.toFixed(2)} RUB (${(minLimit / ad.price).toFixed(6)} ${ad.crypto_currency})
                </span>`;
        }

        if (maxLimit && rubAmount > maxLimit) {
            return out.innerHTML =
                `<span class="purchase_info_text error">
                    Максимальная сумма: ${maxLimit.toFixed(2)} RUB (${(maxLimit / ad.price).toFixed(6)} ${ad.crypto_currency})
                </span>`;
        }

        if (availableCrypto > 0 && cryptoAmount > availableCrypto) {
            return out.innerHTML =
                `<span class="purchase_info_text error">
                    Доступно только ${availableCrypto.toFixed(6)} ${ad.crypto_currency}
                </span>`;
        }

        // --- всё ок ---
        if (currencyMode === 'RUB') {
            out.innerHTML =
                `<span class="purchase_info_text">
                    Вы получите: <b>${cryptoAmount.toFixed(6)}</b> ${ad.crypto_currency}
                </span>`;
        } else {
            out.innerHTML =
                `<span class="purchase_info_text">
                    Вы заплатите: <b>${rubAmount.toFixed(2)}</b> RUB
                </span>`;
        }

        return;
    }

    // 🔴 ПРОДАЖА
    else if (userAction === 'sell') {

        // Используем лимиты для продажи, если они есть, иначе обычные лимиты
        const minLimit = ad.sell_min_limit || ad.min_limit || 0;
        const maxLimit = ad.sell_max_limit || ad.max_limit;
        const userCrypto = ad.user_crypto || userData?.balance || 0; // 🔥 крипта пользователя

        // --- проверки ---
        if (minLimit > 0 && rubAmount < minLimit) {
            return out.innerHTML =
                `<span class="purchase_info_text error">
                    Минимальная сумма: ${minLimit.toFixed(2)} RUB (${(minLimit / ad.price).toFixed(6)} ${ad.crypto_currency})
                </span>`;
        }

        if (maxLimit && rubAmount > maxLimit) {
            return out.innerHTML =
                `<span class="purchase_info_text error">
                    Максимальная сумма: ${maxLimit.toFixed(2)} RUB (${(maxLimit / ad.price).toFixed(6)} ${ad.crypto_currency})
                </span>`;
        }

        if (cryptoAmount > userCrypto) {
            return out.innerHTML =
                `<span class="purchase_info_text error">
                    У вас доступно только ${userCrypto.toFixed(6)} ${ad.crypto_currency}
                </span>`;
        }

        // --- всё ок ---
        out.innerHTML =
            `<span class="purchase_info_text">
                Вы получите: <b>${rubAmount.toFixed(2)}</b> RUB
            </span>`;

        return;
    }
}

function debugTradeInfo(title, data) {
    console.group(
        `%c⚡ ${title}`,
        "color:#fff; background:#4b8bff; padding:4px 10px; border-radius:4px; font-weight:700;"
    );

    for (const [key, value] of Object.entries(data)) {
        console.log(
            `%c${key}: %c${value}`,
            "color:#00e676; font-weight:bold;",
            "color:#fff;"
        );
    }

    console.groupEnd();
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
                alert('Введите сумму');
                return;
            }
            try {
                const userAction = selectedAd.userAction || 'buy';
                let cryptoAmount, fiatAmount;
                
                if (userAction === 'buy') {
                    // Режим ввода: RUB или CRYPTO
                    const currencyMode = selectedAd.currencyMode || 'RUB';
                    if (currencyMode === 'RUB') {
                        // Пользователь вводит сумму ФИАТА
                        fiatAmount = purchaseAmount;
                        cryptoAmount = fiatAmount / selectedAd.price;
                    } else {
                        // Пользователь вводит сумму КРИПТЫ
                        cryptoAmount = purchaseAmount;
                        fiatAmount = cryptoAmount * selectedAd.price;
                    }
                
                    // === Проверка лимитов ===
                    // Всегда проверяем в ФИАТЕ (min_limit / max_limit — всегда RUB)
                    const minLimit = selectedAd.min_limit || 0;
                    const maxLimit = selectedAd.max_limit;
                    
                    if (fiatAmount < minLimit) {
                        const minCrypto = minLimit / selectedAd.price;
                        alert(`Минимальная сумма: ${minLimit.toFixed(2)} RUB (${minCrypto.toFixed(6)} ${selectedAd.crypto_currency})`);
                        return;
                    }
                
                    if (maxLimit && fiatAmount > maxLimit) {
                        const maxCrypto = maxLimit / selectedAd.price;
                        alert(`Максимальная сумма: ${maxLimit.toFixed(2)} RUB (${maxCrypto.toFixed(6)} ${selectedAd.crypto_currency})`);
                        return;
                    }
                
                    // === Проверка доступной крипты на обменнике ===
                    const availableCrypto = selectedAd.crypto_amount || 0;
                
                    if (cryptoAmount > availableCrypto) {
                        alert(`Доступно только ${availableCrypto.toFixed(6)} ${selectedAd.crypto_currency}`);
                        return;
                    }
                } else {
                    // Продажа: purchaseAmount - это количество криптовалюты, которое продаем
                    cryptoAmount = purchaseAmount;
                    fiatAmount = cryptoAmount * selectedAd.price; // Рубли, которые получим
                    
                    // Используем лимиты для продажи, если они есть, иначе обычные лимиты
                    const minLimit = selectedAd.sell_min_limit || selectedAd.min_limit || 0;
                    const maxLimit = selectedAd.sell_max_limit || selectedAd.max_limit;
                    
                    // Проверяем лимиты в рублях
                    if (fiatAmount < minLimit) {
                        alert(`Минимальная сумма продажи: ${minLimit.toFixed(2)} RUB (${(minLimit / selectedAd.price).toFixed(6)} ${selectedAd.crypto_currency})`);
                        return;
                    }
                    
                    if (maxLimit && fiatAmount > maxLimit) {
                        alert(`Максимальная сумма продажи: ${maxLimit.toFixed(2)} RUB (${(maxLimit / selectedAd.price).toFixed(6)} ${selectedAd.crypto_currency})`);
                        return;
                    }
                    
                    // Проверяем баланс пользователя (достаточно ли криптовалюты)
                    const userBalance = userData?.balance || 0;
                    if (cryptoAmount > userBalance) {
                        alert(`Недостаточно средств на балансе!\nВаш баланс: ${userBalance.toFixed(6)} ${selectedAd.crypto_currency}\nТребуется: ${cryptoAmount.toFixed(6)} ${selectedAd.crypto_currency}`);
                        return;
                    }
                    
                    // Проверяем, что продавец ввел реквизиты для получения денег
                    const sellerBankName = document.getElementById('seller-bank-name')?.value.trim();
                    const sellerPaymentDetails = document.getElementById('seller-payment-details')?.value.trim();
                    
                    if (!sellerBankName || !sellerPaymentDetails) {
                        alert('Пожалуйста, укажите реквизиты для получения денег (банк и номер карты/телефона)');
                        
                        // Подсвечиваем незаполненные поля
                        const sellerBankNameInput = document.getElementById('seller-bank-name');
                        const sellerPaymentDetailsInput = document.getElementById('seller-payment-details');
                        if (sellerBankNameInput && !sellerBankName) {
                            sellerBankNameInput.classList.add('error');
                        }
                        if (sellerPaymentDetailsInput && !sellerPaymentDetails) {
                            sellerPaymentDetailsInput.classList.add('error');
                        }
                        return;
                    }
                }
                const transactionData = {
                    ad_id: selectedAd.Id,
                    crypto_currency: selectedAd.crypto_currency,
                    crypto_amount: cryptoAmount,
                    fiat_amount: fiatAmount
                };
                if (userAction === 'sell') {
                    const sellerBankName = document.getElementById('seller-bank-name')?.value.trim();
                    const sellerPaymentDetails = document.getElementById('seller-payment-details')?.value.trim();
                    
                    transactionData.seller_bank_name = sellerBankName;
                    transactionData.seller_payment_details = sellerPaymentDetails;
                }
                
                console.log('Создание транзакции:', {
                    userAction,
                    adType: selectedAd.type,
                    transactionData
                });
                
                console.log('Отправка transactionData:', transactionData);
                
                // Проверяем наличие токена перед отправкой
                const currentToken = accessToken || getCookie('ACCESS_TOKEN');
                if (!currentToken) {
                    console.warn('Токен не найден перед созданием сделки, пытаемся аутентифицироваться...');
                    await authenticateWithTelegram();
                }
                
                const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(transactionData)
                });
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Не удалось прочитать ошибку');
                    console.error('Ошибка создания сделки:', response.status, errorText);
                    throw new Error(`Ошибка создания сделки: ${response.status} ${errorText}`);
                }
                
                currentTransaction = await response.json();
                
                // Проверяем, что транзакция была успешно создана
                if (!currentTransaction || !currentTransaction.id) {
                    throw new Error('Не удалось создать транзакцию: сервер не вернул данные транзакции');
                }
                
                // Сохраняем ID транзакции в selectedAd для восстановления при необходимости
                if (selectedAd && currentTransaction) {
                    selectedAd.transactionId = currentTransaction.id;
                }
                
                // Логируем данные перед открытием экрана оплаты
                console.log('Открытие экрана оплаты:', {
                    selectedAd,
                    currentTransaction,
                    purchaseAmount,
                    userAction,
                    bank_name: selectedAd.bank_name,
                    payment_details: selectedAd.payment_details,
                    transactionId: currentTransaction.id
                });
                
                // Открываем экран оплаты
                // Для покупки передаем сумму в рублях, для продажи - в криптовалюте
                const amountForPayment = userAction === 'buy' ? fiatAmount : cryptoAmount;
                openPaymentScreen(selectedAd, amountForPayment, userAction);
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
            // НЕ очищаем selectedAd и currentTransaction при возврате назад
        });
    }
    
    // Обработчик кнопки "Назад" на экране оплаты
    const backFromPaymentBtn = document.getElementById('back-from-payment');
    if (backFromPaymentBtn) {
        backFromPaymentBtn.addEventListener('click', () => {
            document.getElementById('payment-screen').style.display = 'none';
            document.getElementById('ad-details-screen').style.display = 'block';
            // НЕ очищаем selectedAd и currentTransaction при возврате назад
        });
    }
    
    // Обработчик кнопки "Я перевел средства"
    const paymentConfirmedBtn = document.getElementById('payment-confirmed-btn');
    if (paymentConfirmedBtn) {
        paymentConfirmedBtn.addEventListener('click', async () => {
            // Если currentTransaction не установлен, пытаемся получить его из selectedAd
            if (!currentTransaction && selectedAd && selectedAd.transactionId) {
                try {
                    const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/${selectedAd.transactionId}`, {
                        method: 'GET'
                    });
                    if (response.ok) {
                        currentTransaction = await response.json();
                    }
                } catch (error) {
                    console.error('Ошибка при получении сделки:', error);
                }
            }
            
            if (!currentTransaction) {
                console.error('Ошибка: currentTransaction не найден', {
                    selectedAd: !!selectedAd,
                    currentTransaction: !!currentTransaction,
                    transactionId: selectedAd?.transactionId
                });
                alert('Ошибка: данные сделки не найдены. Пожалуйста, попробуйте снова.');
                return;
            }
            
            try {
                // Отмечаем сделку как оплаченную
                const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/${currentTransaction.id}/pay`, {
                    method: 'POST'
                });
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Неизвестная ошибка');
                    throw new Error(`Ошибка подтверждения оплаты: ${errorText}`);
                }
                
                alert('Оплата подтверждена! Продавец получит уведомление.');
                // Закрываем экран оплаты и возвращаемся на главный
                document.getElementById('payment-screen').style.display = 'none';
                document.getElementById('main__screen').style.display = 'block';
                
                // Обновляем баланс
                if (userData) {
                    await refreshUserBalance();
                }
                
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
            // Покупка: usdtAmount - это рубли, которые нужно перевести
            paymentAmountEl.textContent = `${usdtAmount.toFixed(2)} RUB`;
        } else {
            // Продажа: usdtAmount - это количество криптовалюты, конвертируем в рубли
            const fiatAmount = usdtAmount * ad.price;
            paymentAmountEl.textContent = `${fiatAmount.toFixed(2)} RUB`;
        }
    }
    
    // Заполняем реквизиты
    const paymentDetailsEl = document.getElementById('payment-details');
    
    if (!paymentDetailsEl) {
        console.error('Элемент payment-details не найден!');
        return;
    }
    
    let bankName, paymentDetails;
    
    // Определяем, откуда брать реквизиты
    if (userAction === 'buy') {
        // Покупка: показываем реквизиты продавца
        // Если объявление на продажу (ad.type === 'sell'), реквизиты продавца из объявления
        // Если объявление на покупку (ad.type === 'buy'), реквизиты продавца из транзакции (введенные при создании сделки)
        if (ad.type === 'sell') {
            // Объявление на продажу: реквизиты продавца из объявления
            bankName = ad.bank_name || 'Не указан';
            paymentDetails = ad.payment_details || 'Не указаны';
        } else {
            // Объявление на покупку: реквизиты продавца из транзакции (введенные при создании сделки)
            if (currentTransaction && currentTransaction.seller_bank_name && currentTransaction.seller_payment_details) {
                bankName = currentTransaction.seller_bank_name;
                paymentDetails = currentTransaction.seller_payment_details;
            } else {
                // Fallback на реквизиты из объявления (на случай, если они там есть)
                bankName = ad.bank_name || 'Не указан';
                paymentDetails = ad.payment_details || 'Не указаны';
            }
        }
    } else {
        // Продажа (userAction === 'sell'): показываем реквизиты покупателя
        // Когда пользователь продает, объявление должно быть на покупку (ad.type === 'buy')
        // В этом случае владелец объявления - покупатель, его реквизиты в ad.bank_name и ad.payment_details
        // Но также нужно проверить реквизиты из транзакции, если они там есть
        if (currentTransaction && currentTransaction.buyer_bank_name && currentTransaction.buyer_payment_details) {
            // Используем реквизиты покупателя из транзакции
            bankName = currentTransaction.buyer_bank_name;
            paymentDetails = currentTransaction.buyer_payment_details;
        } else {
            // Fallback на реквизиты из объявления
            bankName = ad.bank_name || 'Не указан';
            paymentDetails = ad.payment_details || 'Не указаны';
        }
    }
    
    console.log('Заполнение реквизитов:', {
        element: !!paymentDetailsEl,
        userAction,
        adType: ad.type,
        bankName,
        paymentDetails,
        transaction: currentTransaction
    });
    
    // Очищаем содержимое перед заполнением
    paymentDetailsEl.innerHTML = '';
    
    // Создаем элементы реквизитов
    const bankItem = document.createElement('div');
    bankItem.className = 'payment_detail_item';
    bankItem.innerHTML = `
        <span class="payment_detail_label">Банк:</span>
        <span class="payment_detail_value">${escapeHtml(bankName)}</span>
    `;
    
    const detailsItem = document.createElement('div');
    detailsItem.className = 'payment_detail_item';
    detailsItem.innerHTML = `
        <span class="payment_detail_label">Реквизиты:</span>
        <span class="payment_detail_value">${escapeHtml(paymentDetails)}</span>
    `;
    
    paymentDetailsEl.appendChild(bankItem);
    paymentDetailsEl.appendChild(detailsItem);
    
    console.log('Реквизиты заполнены:', { bankName, paymentDetails, innerHTML: paymentDetailsEl.innerHTML });
    
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

// Функция для экранирования HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
                    <span class="my_ad_value">${ad.crypto_amount.toFixed(1)} ${ad.crypto_currency}</span>
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
                    Покупатель перевел <strong>${transaction.fiat_amount.toFixed(2)} RUB</strong>
                </div>
                <div class="notification_details">
                    <div class="notification_detail_row">
                        <span>Криптовалюта:</span>
                        <span>${transaction.crypto_amount.toFixed(1)} ${transaction.crypto_currency}</span>
                    </div>
                    <div class="notification_detail_row">
                        <span>Цена:</span>
                        <span>${transaction.price.toFixed(2)} RUB</span>
                    </div>
                    ${transaction.buyer_bank_name && transaction.buyer_payment_details ? `
                    <div class="notification_detail_row">
                        <span>Реквизиты покупателя:</span>
                        <span>${transaction.buyer_bank_name} - ${transaction.buyer_payment_details}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            <div class="notification_actions">
                <button class="notification_confirm_btn" data-transaction-id="${transaction.id}" id="confirm-${transaction.id}">
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
            
            // Реквизиты продавца уже указаны в объявлении, поэтому просто подтверждаем
            await confirmTransaction(transactionId, null, null);
        });
    });
}

// Функция подтверждения сделки продавцом
async function confirmTransaction(transactionId, bankName, paymentDetails) {
    if (!confirm('Вы подтверждаете получение денег от покупателя?')) {
        return;
    }
    
    try {
        // Реквизиты продавца уже указаны в объявлении, поэтому отправляем пустые значения
        // (или можно вообще не отправлять, если бэкенд не требует)
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/${transactionId}/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bank_name: bankName || null,
                payment_details: paymentDetails || null
            })
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
        
        // Если открыт экран деталей сделки, закрываем его и возвращаемся к списку
        const transactionDetailsScreen = document.getElementById('transaction-details-screen');
        if (transactionDetailsScreen && transactionDetailsScreen.style.display !== 'none') {
            transactionDetailsScreen.style.display = 'none';
            const myTransactionsScreen = document.getElementById('my-transactions-screen');
            if (myTransactionsScreen) {
                myTransactionsScreen.style.display = 'block';
                await loadMyTransactions();
            }
        }
    } catch (error) {
        console.error('Ошибка при подтверждении сделки:', error);
        alert('Ошибка подтверждения сделки: ' + error.message);
    }
}

// ========== ЭКРАН "МОИ СДЕЛКИ" ==========

// Функция загрузки моих сделок
async function loadMyTransactions() {
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/my`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки сделок');
        }
        
        const transactions = await response.json();
        displayMyTransactions(transactions);
    } catch (error) {
        console.error('Ошибка при загрузке сделок:', error);
        const transactionsList = document.getElementById('transactions-list');
        if (transactionsList) {
            transactionsList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 40px;">Ошибка загрузки сделок</p>';
        }
    }
}

// Функция отображения моих сделок
async function displayMyTransactions(transactions) {
    const transactionsList = document.getElementById('transactions-list');
    if (!transactionsList) return;
    
    transactionsList.innerHTML = '';
    
    if (!transactions || transactions.length === 0) {
        transactionsList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 40px;">У вас пока нет сделок</p>';
        return;
    }
    
    // Получаем ID пользователя один раз для всех транзакций
    let currentUserId = null;
    if (userData && userData.id) {
        currentUserId = userData.id;
    } else {
        // Пытаемся получить ID из /api/auth/me
        console.warn('userData.id не найден, пытаемся получить ID пользователя...');
        try {
            const meResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/api/auth/me`, {
                method: 'GET'
            });
            if (meResponse.ok) {
                const meData = await meResponse.json();
                currentUserId = meData.id;
                if (userData) {
                    userData.id = currentUserId;
                } else {
                    userData = meData;
                }
            }
        } catch (error) {
            console.error('Ошибка при получении ID пользователя:', error);
        }
    }
    
    transactions.forEach(transaction => {
        const transactionCard = document.createElement('div');
        transactionCard.className = 'transaction_card';
        transactionCard.setAttribute('data-transaction-id', transaction.id);
        
        // Определяем роль пользователя в сделке
        const isBuyer = currentUserId && transaction.buyer_id === currentUserId;
        const isSeller = currentUserId && transaction.seller_id === currentUserId;
        const role = isBuyer ? 'Покупатель' : (isSeller ? 'Продавец' : 'Неизвестно');
        
        // Определяем статус
        const statusText = {
            'pending': 'Ожидание оплаты',
            'paid': 'Оплачено',
            'confirmed': 'Подтверждено',
            'completed': 'Завершено',
            'cancelled': 'Отменено'
        }[transaction.status] || transaction.status;
        
        transactionCard.innerHTML = `
            <div class="transaction_card_header">
                <div class="transaction_role_badge ${isBuyer ? 'badge_buyer' : 'badge_seller'}">
                    ${role}
                </div>
                <div class="transaction_status_badge status_${transaction.status}">
                    ${statusText}
                </div>
            </div>
            <div class="transaction_card_content">
                <div class="transaction_card_row">
                    <span class="transaction_card_label">Криптовалюта:</span>
                    <span class="transaction_card_value">${transaction.crypto_amount.toFixed(1)} ${transaction.crypto_currency}</span>
                </div>
                <div class="transaction_card_row">
                    <span class="transaction_card_label">Сумма:</span>
                    <span class="transaction_card_value">${transaction.fiat_amount.toFixed(2)} RUB</span>
                </div>
                <div class="transaction_card_row">
                    <span class="transaction_card_label">Цена:</span>
                    <span class="transaction_card_value">${transaction.price.toFixed(2)} RUB</span>
                </div>
                <div class="transaction_card_row">
                    <span class="transaction_card_label">Дата:</span>
                    <span class="transaction_card_value">${new Date(transaction.created_at).toLocaleString('ru-RU')}</span>
                </div>
            </div>
            <div class="transaction_card_actions">
                <button class="transaction_view_btn" data-transaction-id="${transaction.id}">
                    Открыть
                </button>
            </div>
        `;
        
        transactionsList.appendChild(transactionCard);
    });
    
    // Добавляем обработчики кнопок открытия сделки
    document.querySelectorAll('.transaction_view_btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const transactionId = parseInt(btn.getAttribute('data-transaction-id'));
            await openTransactionDetails(transactionId);
        });
    });
}

// Функция открытия деталей сделки
async function openTransactionDetails(transactionId) {
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/${transactionId}`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки сделки');
        }
        
        const transaction = await response.json();
        
        // Получаем объявление для реквизитов (используем существующий эндпоинт)
        let ad = null;
        try {
            const adsResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/api/ads`, {
                method: 'GET'
            });
            if (adsResponse.ok) {
                const allAds = await adsResponse.json();
                ad = allAds.find(a => a.Id === transaction.ad_id) || null;
            }
        } catch (error) {
            console.error('Ошибка при получении объявления:', error);
        }
        
        await displayTransactionDetails(transaction, ad);
        
        // Показываем экран деталей
        const myTransactionsScreen = document.getElementById('my-transactions-screen');
        if (myTransactionsScreen) {
            myTransactionsScreen.style.display = 'none';
        }
        const transactionDetailsScreen = document.getElementById('transaction-details-screen');
        if (transactionDetailsScreen) {
            transactionDetailsScreen.style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка при открытии деталей сделки:', error);
        alert('Ошибка загрузки сделки: ' + error.message);
    }
}

// Функция отображения деталей сделки
async function displayTransactionDetails(transaction, ad) {
    const detailsCard = document.getElementById('transaction-details-card');
    const actionsDiv = document.getElementById('transaction-actions');
    
    if (!detailsCard || !actionsDiv) return;
    
    // Определяем роль пользователя
    // Получаем ID пользователя из userData или из токена
    let currentUserId = null;
    if (userData && userData.id) {
        currentUserId = userData.id;
    } else {
        // Пытаемся получить ID из токена или из /api/auth/me
        console.warn('userData.id не найден в displayTransactionDetails, пытаемся получить ID пользователя...');
        try {
            const meResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/api/auth/me`, {
                method: 'GET'
            });
            if (meResponse.ok) {
                const meData = await meResponse.json();
                currentUserId = meData.id;
                if (userData) {
                    userData.id = currentUserId;
                } else {
                    userData = meData;
                }
            }
        } catch (error) {
            console.error('Ошибка при получении ID пользователя:', error);
        }
    }
    
    const isBuyer = currentUserId && transaction.buyer_id === currentUserId;
    const isSeller = currentUserId && transaction.seller_id === currentUserId;
    
    // Формируем информацию о сделке
    let detailsHTML = `
        <div class="transaction_details_info">
            <div class="transaction_details_row">
                <span class="transaction_details_label">Статус:</span>
                <span class="transaction_details_value status_${transaction.status}">
                    ${{
                        'pending': 'Ожидание оплаты',
                        'paid': 'Оплачено',
                        'confirmed': 'Подтверждено',
                        'completed': 'Завершено',
                        'cancelled': 'Отменено'
                    }[transaction.status] || transaction.status}
                </span>
            </div>
            <div class="transaction_details_row">
                <span class="transaction_details_label">Ваша роль:</span>
                <span class="transaction_details_value">${isBuyer ? 'Покупатель' : (isSeller ? 'Продавец' : 'Неизвестно')}</span>
            </div>
            <div class="transaction_details_row">
                <span class="transaction_details_label">Криптовалюта:</span>
                <span class="transaction_details_value">${transaction.crypto_amount.toFixed(1)} ${transaction.crypto_currency}</span>
            </div>
            <div class="transaction_details_row">
                <span class="transaction_details_label">Сумма:</span>
                <span class="transaction_details_value">${transaction.fiat_amount.toFixed(2)} RUB</span>
            </div>
            <div class="transaction_details_row">
                <span class="transaction_details_label">Цена за 1 ${transaction.crypto_currency}:</span>
                <span class="transaction_details_value">${transaction.price.toFixed(2)} RUB</span>
            </div>
            <div class="transaction_details_row">
                <span class="transaction_details_label">Дата создания:</span>
                <span class="transaction_details_value">${new Date(transaction.created_at).toLocaleString('ru-RU')}</span>
            </div>
    `;
    if (isBuyer) {
        // Покупатель видит реквизиты продавца для перевода денег
        let sellerBankName = null;
        let sellerPaymentDetails = null;
        
        // Сначала проверяем реквизиты продавца из транзакции
        if (transaction.seller_bank_name && transaction.seller_payment_details) {
            sellerBankName = transaction.seller_bank_name;
            sellerPaymentDetails = transaction.seller_payment_details;
        } 
        // Если объявление на продажу, реквизиты продавца из объявления
        else if (ad && ad.type === 'sell' && ad.bank_name && ad.payment_details) {
            sellerBankName = ad.bank_name;
            sellerPaymentDetails = ad.payment_details;
        }
        
        if (sellerBankName && sellerPaymentDetails) {
            detailsHTML += `
                <div class="transaction_details_section">
                    <div class="transaction_details_section_title">Реквизиты для перевода:</div>
                    <div class="transaction_details_row">
                        <span class="transaction_details_label">Банк:</span>
                        <span class="transaction_details_value">${escapeHtml(sellerBankName)}</span>
                    </div>
                    <div class="transaction_details_row">
                        <span class="transaction_details_label">Реквизиты:</span>
                        <span class="transaction_details_value">${escapeHtml(sellerPaymentDetails)}</span>
                    </div>
                </div>
            `;
        }
    } else if (isSeller) {
        if (ad && ad.type === 'buy' && ad.bank_name && ad.payment_details) {
            detailsHTML += `
                <div class="transaction_details_section">
                    <div class="transaction_details_section_title">Реквизиты покупателя:</div>
                    <div class="transaction_details_row">
                        <span class="transaction_details_label">Банк:</span>
                        <span class="transaction_details_value">${escapeHtml(ad.bank_name)}</span>
                    </div>
                    <div class="transaction_details_row">
                        <span class="transaction_details_label">Реквизиты:</span>
                        <span class="transaction_details_value">${escapeHtml(ad.payment_details)}</span>
                    </div>
                </div>
            `;
        }
    }
    if (transaction.buyer_paid_at) {
        detailsHTML += `
            <div class="transaction_details_row">
                <span class="transaction_details_label">Оплачено:</span>
                <span class="transaction_details_value">${new Date(transaction.buyer_paid_at).toLocaleString('ru-RU')}</span>
            </div>
        `;
    }
    detailsHTML += `</div>`;
    detailsCard.innerHTML = detailsHTML;

    let actionsHTML = '';
    
    if (isBuyer && transaction.status === 'pending') {
        // Покупатель может подтвердить перевод
        actionsHTML = `
            <button class="transaction_action_btn btn_primary" id="confirm-payment-btn" data-transaction-id="${transaction.id}">
                Я перевел средства
            </button>
        `;
    } else if (isSeller && transaction.status === 'paid') {
        // Продавец может подтвердить получение
        actionsHTML = `
            <button class="transaction_action_btn btn_primary" id="confirm-transaction-btn" data-transaction-id="${transaction.id}">
                Подтвердить получение
            </button>
        `;
    }
    
    actionsDiv.innerHTML = actionsHTML;
    
    // Добавляем обработчики кнопок
    const confirmPaymentBtn = document.getElementById('confirm-payment-btn');
    if (confirmPaymentBtn) {
        confirmPaymentBtn.addEventListener('click', async () => {
            const transactionId = parseInt(confirmPaymentBtn.getAttribute('data-transaction-id'));
            await markTransactionPaid(transactionId);
        });
    }
    
    const confirmTransactionBtn = document.getElementById('confirm-transaction-btn');
    if (confirmTransactionBtn) {
        confirmTransactionBtn.addEventListener('click', async () => {
            const transactionId = parseInt(confirmTransactionBtn.getAttribute('data-transaction-id'));
            await confirmTransaction(transactionId, null, null);
        });
    }
    
}

// Функция подтверждения перевода покупателем
async function markTransactionPaid(transactionId) {
    if (!confirm('Вы подтверждаете, что перевели средства?')) {
        return;
    }
    
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/transactions/${transactionId}/pay`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка подтверждения перевода');
        }
        
        alert('Перевод подтвержден! Продавец получит уведомление.');
        
        // Обновляем детали сделки
        await openTransactionDetails(transactionId);
        
        // Обновляем баланс
        if (userData) {
            await refreshUserBalance();
        }
    } catch (error) {
        console.error('Ошибка при подтверждении перевода:', error);
        alert('Ошибка подтверждения перевода: ' + error.message);
    }
}

// Инициализация обработчиков для экрана "О нас"
document.addEventListener('DOMContentLoaded', () => {
    // Обработчик кнопки "Назад" на экране "О нас"
    const backFromAboutBtn = document.getElementById('back-from-about');
    if (backFromAboutBtn) {
        backFromAboutBtn.addEventListener('click', () => {
            const aboutScreen = document.getElementById('about-screen');
            const mainScreen = document.getElementById('main__screen');
            
            if (aboutScreen && mainScreen) {
                aboutScreen.style.display = 'none';
                mainScreen.style.display = 'block';
            }
        });
    }
    

    
    
    // ========== АДМИН ПАНЕЛЬ ==========
    
    // Проверяем, является ли пользователь администратором и показываем кнопку
    checkAdminAccess();
    
    // Обработчик кнопки "Назад" на админ панели
    const backFromAdminPanelBtn = document.getElementById('back-from-admin-panel');
    if (backFromAdminPanelBtn) {
        backFromAdminPanelBtn.addEventListener('click', () => {
            const adminPanelScreen = document.getElementById('admin-panel-screen');
            const mainScreen = document.getElementById('main__screen');
            
            if (adminPanelScreen && mainScreen) {
                adminPanelScreen.style.display = 'none';
                mainScreen.style.display = 'block';
            }
        });
    }
    
    // Обработчики вкладок админ панели
    const adminTabs = document.querySelectorAll('.admin_tab');
    adminTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            
            // Убираем active со всех вкладок
            adminTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Скрываем все контенты
            document.querySelectorAll('.admin_tab_content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Показываем нужный контент
            const targetContent = document.getElementById(`admin-tab-${tabName}`);
            if (targetContent) {
                targetContent.classList.add('active');
                
                if (tabName === 'statistics') {
                    loadAdminStatistics();
                }
            }
        });
    });
    
});

// Функция проверки прав администратора
async function checkAdminAccess() {
    try {
        if (!userData || !userData.id) {
            const meResponse = await makeAuthenticatedRequest(`${API_BASE_URL}/api/auth/me`, {
                method: 'GET'
            });
            if (meResponse.ok) {
                userData = await meResponse.json();
            }
        }
        
        if (userData && userData.is_admin) {
            // Добавляем кнопку "Админ панель" в главное меню
            const mainScreen = document.getElementById('main__screen');
            if (mainScreen) {
                // Ищем место для вставки кнопки (например, после кнопки "О нас")
                const aboutBtn = document.getElementById('about_us');
                const menuSection = aboutBtn ? aboutBtn.parentNode : document.querySelector('.menu_section');
                
                if (menuSection && !document.getElementById('admin-panel-btn')) {
                    const adminBtn = document.createElement('div');
                    adminBtn.id = 'admin-panel-btn';
                    adminBtn.className = 'menu_item';
                    adminBtn.innerHTML = `
                        <div class="menu_item_icon" style="background: linear-gradient(135deg, rgba(0, 128, 255, 0.2) 0%, rgba(0, 102, 204, 0.15) 100%); color: #0080ff;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <div class="menu_item_content">
                            <div class="menu_item_title">Админ панель</div>
                            <div class="menu_item_desc">Управление платформой</div>
                        </div>
                        <div class="menu_item_arrow">›</div>
                    `;
                    adminBtn.style.cursor = 'pointer';
                    adminBtn.addEventListener('click', () => {
                        openAdminPanel();
                    });
                    
                    if (aboutBtn) {
                        aboutBtn.parentNode.insertBefore(adminBtn, aboutBtn.nextSibling);
                    } else if (menuSection) {
                        menuSection.appendChild(adminBtn);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Ошибка при проверке прав администратора:', error);
    }
}

// Функция открытия админ панели
function openAdminPanel() {
    const adminPanelScreen = document.getElementById('admin-panel-screen');
    const mainScreen = document.getElementById('main__screen');
    
    if (adminPanelScreen && mainScreen) {
        mainScreen.style.display = 'none';
        adminPanelScreen.style.display = 'block';
        window.scrollTo(0, 0);
        
        // Загружаем статистику
        loadAdminStatistics();
    }
}

// Функция загрузки статистики
async function loadAdminStatistics() {
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE_URL}/api/admin/statistics`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки статистики');
        }
        
        const stats = await response.json();
        
        // Обновляем значения
        document.getElementById('stat-total-users').textContent = stats.total_users || 0;
        document.getElementById('stat-total-ads').textContent = stats.total_ads || 0;
        document.getElementById('stat-active-ads').textContent = `Активных: ${stats.active_ads || 0}`;
        document.getElementById('stat-total-transactions').textContent = stats.total_transactions || 0;
        document.getElementById('stat-completed-transactions').textContent = `Завершено: ${stats.completed_transactions || 0}`;
        document.getElementById('stat-total-volume').textContent = `${(stats.total_volume || 0).toFixed(2)} RUB`;
        document.getElementById('stat-crypto-volume').textContent = `Крипта: ${(stats.total_crypto_volume || 0).toFixed(2)}`;
    } catch (error) {
        console.error('Ошибка при загрузке статистики:', error);
        alert('Ошибка при загрузке статистики');
    }
}
