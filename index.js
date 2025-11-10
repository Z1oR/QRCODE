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
    
    if (!paymentMethodItems.length) return
    
    // По умолчанию выбираем первый метод
    paymentMethodItems[0].classList.add('selected')
    
    paymentMethodItems.forEach(item => {
        item.addEventListener('click', () => {
            // Убираем выделение со всех методов
            paymentMethodItems.forEach(i => i.classList.remove('selected'))
            
            // Добавляем выделение на выбранный метод
            item.classList.add('selected')
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
        const minLimit = document.querySelector('#min-limit')?.value || '500'
        const maxLimit = document.querySelector('#max-limit')?.value || '50000'
        
        // Собираем данные о реквизитах (только для продажи)
        let paymentMethod = ''
        let paymentDetails = ''
        
        if (action === 'sell') {
            const selectedMethod = document.querySelector('.payment_method_item.selected')
            if (selectedMethod) {
                const methodName = selectedMethod.querySelector('.payment_method_name')?.textContent || ''
                paymentMethod = methodName
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
    createListingBtn.addEventListener('click', () => {
        // Здесь будет логика создания объявления через API
        console.log('Создание объявления...')
        
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
            
            window.scrollTo(0, 0)
        }, 1500)
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
        const minValue = minLimit || '500'
        const maxValue = maxLimit || '50,000'
        
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
