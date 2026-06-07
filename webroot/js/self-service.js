/**
 * FoodCoopShop - The open source software for your foodcoop
 *
 * Licensed under the GNU Affero General Public License version 3
 * For full copyright and license information, please see LICENSE
 * Redistributions of files must retain the above copyright notice.
 *
 * @since         FoodCoopShop 2.5.0
 * @license       https://opensource.org/licenses/AGPL-3.0
 * @author        Mario Rothauer <office@foodcoopshop.com>
 * @copyright     Copyright (c) Mario Rothauer, https://www.rothauer-it.com
 * @link          https://www.foodcoopshop.com
 */
foodcoopshop.SelfService = {

    autoLogoutTimer : 180,
    currentLogoutTimer : 0,
    defaultStartUrl: null,
    useDefaultStart: false,

    // --- Scan Queue ---
    scanQueue : [],
    isProcessing : false,

    /**
     * Adds a barcode/keyword to the scan queue and starts processing if idle.
     * @param {string} keyword
     */
    enqueueScan : function(keyword) {
        this.scanQueue.push(keyword);
        this.processNextScan();
    },

    /**
     * Processes the next scan in the queue, if not already processing.
     * Navigation (redirect) counts as "processing" until the page unloads.
     */
    processNextScan : function() {
        if (this.isProcessing) {
            return;
        }
        if (this.scanQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        var keyword = this.scanQueue.shift();

        var redirectUrl = '/' + __('route_self_service') + '?keyword=' + encodeURIComponent(keyword);
        document.location.href = redirectUrl;

        setTimeout(function() {
            foodcoopshop.SelfService.isProcessing = false;
            foodcoopshop.SelfService.processNextScan();
        }, 3000);
    },

    init : function() {
        foodcoopshop.ModalLogout.init(document.location.href);
        foodcoopshop.ColorMode.init();
        this.initWindowResize();
        this.detectDefaultStart();
        this.initDefaultStartUI();
        this.initSearchForm();
        this.bindQuantityInUnitsInputFields();
        this.initDepositPayment();
        this.initGlobalBarcodeScannerListener();
    },

    injectLoginButtons : function(buttonHtml) {
        if (this.useDefaultStart) {
            return; // Bricht ab und verhindert den normalen Login-Button
        }
        $('.self-service-login-button-wrapper').append(atob(buttonHtml));
    },

    initMobileBarcodeScanningWithCamera : function(afterElementForLoader, afterElementForCamera, callback) {

        if (!this.isMobileBarcodeScanningSupported) {
            alert('mobile_barcode_scanning_not_supported');
            return;
        }

        if ($('#camera').length > 0) {
            Quagga.stop();
            $('#camera').remove();
            return;
        }

        $(afterElementForCamera).after($('<div />').attr('id', 'camera'));
        foodcoopshop.SelfService.hideLoader();
        foodcoopshop.SelfService.showLoader(afterElementForLoader);

        Quagga.init({
            inputStream : {
                name : 'Live',
                type : 'LiveStream',
                target: document.querySelector('#camera'),
            },
            numOfWorkers: navigator.hardwareConcurrency,
            decoder : {
                readers : [
                    'code_39_reader',
                    'ean_reader',
                ],
            },
        }, function(err) {
            if (err) {
                console.log(err);
                return;
            }

            Quagga.start();

            $('#camera').animate({
                height: 'toggle'
            }, 150);
            foodcoopshop.SelfService.hideLoader();

        });
        Quagga.offDetected();
        Quagga.onDetected(function(result) {
            Quagga.stop();
            foodcoopshop.SelfService.hideLoader();
            foodcoopshop.SelfService.showLoader(afterElementForLoader);
            callback(result);
        });

    },

    mobileScannerCallbackForLogin : function(result) {
        var loginForm = $('#LoginForm');
        loginForm.find('#barcode').val(result.codeResult.code);
        foodcoopshop.SelfService.submitForm(loginForm, 'fa-sign-in-alt');
    },

    mobileScannerCallbackForProducts : function(result) {
        foodcoopshop.SelfService.enqueueScan(result.codeResult.code);
    },

    showLoader : function(afterElementForLoader) {
        $('#responsive-header ' + afterElementForLoader).after($('<i />').addClass('fa fa-circle-notch fa-spin fa-2x'));
    },

    hideLoader: function() {
        $('#responsive-header i.fa-circle-notch').remove();
    },

    isMobileBarcodeScanningSupported : function() {
        return navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    },

    initLoginForm : function() {

        var barcodeInputField = $('#barcode');
        barcodeInputField.on('keydown', function(e) {
            if (e.keyCode === 13) {
                var barcode = $(this).val() ? String($(this).val()).trim() : '';
                var email = $('#email').length ? String($('#email').val()).trim() : '';
                var password = $('#password').length ? String($('#password').val()).trim() : '';

                if (barcode !== '' && email === '' && password === '') {
                    e.preventDefault();
                    e.stopPropagation();

                    foodcoopshop.SelfService.checkBarcodeBeforeLogin(barcode);
                    return false;
                }
            }
        });

        barcodeInputField.on('keyup focus', function (e) {
            $(this).prop('type', 'password'); // to avoid autocomplete
        });

        var loginForm = $('#LoginForm');
        var formIsSubmitted = false;
        loginForm.on('submit', function(e) {
            var barcode = $('#barcode').val() ? String($('#barcode').val()).trim() : '';
            var email = $('#email').length ? String($('#email').val()).trim() : '';
            var password = $('#password').length ? String($('#password').val()).trim() : '';

            if (barcode !== '' && email === '' && password === '') {
                e.preventDefault();
                e.stopImmediatePropagation();
                foodcoopshop.SelfService.checkBarcodeBeforeLogin(barcode);
                return false;
            }

            if (formIsSubmitted) { return false; }
            formIsSubmitted = true;
            return true;
        });

        barcodeInputField.focus();

        var cameraButton = $('<a/>').
            addClass('btn'). addClass('btn-camera'). addClass('btn-success').
            attr('href', 'javascript:void(0);').
            html('<i class="fas fa-camera fa-2x"></i>').
            on('click', function() {
                foodcoopshop.SelfService.initMobileBarcodeScanningWithCamera('.btn-camera', '#login-form h1', foodcoopshop.SelfService.mobileScannerCallbackForLogin);
            });
        $('#responsive-header .sb-toggle-left').after(cameraButton);
        this.detectDefaultStart();
        this.initDefaultStartUI();
        },

        checkBarcodeBeforeLogin: function(barcode) {
        $.ajax({
            url: '/' + __('route_self_service') + '/check-barcode-type',
            type: 'GET',
            data: { barcode: barcode },
            dataType: 'json',
            cache: false,
            success: function(response) {
                if (response && response.type === 'customer') {
                    try { sessionStorage.removeItem('selfServiceInitialKeyword'); } catch (err) {}
                    try { sessionStorage.setItem('clearCustomerBarcode', barcode); } catch (err) {}
                
                    var form = $('#LoginForm');
                    form[0].submit();
                } else {
                    var startUrl = null;
                    try { startUrl = localStorage.getItem('fcs_self_service_start_url'); } catch (err) {}

                    if (startUrl) {
                        try { sessionStorage.setItem('selfServiceInitialKeyword', barcode); } catch (err) {}
                        window.location.href = startUrl;
                    } else {
                        foodcoopshop.Helper.showErrorMessage('Bitte wähle zuerst einen Standort aus, bevor du ein Produkt scannst.');
                        foodcoopshop.SelfService.playErrorSound();
                        $('#barcode').val('');
                    }
                }
            },
            error: function(xhr, status, error) {
                console.error("=== BARCODE-API FEHLERSUCHE ===");
                console.error("Status:", status);
                console.error("Server-Antwort:", xhr.responseText);
                foodcoopshop.Helper.showErrorMessage('Barcode-Prüfung fehlgeschlagen. Bitte prüfe die F12-Konsole.');
                $('#barcode').val('');
            }
        });
    },

    initDepositPayment : function() {
        foodcoopshop.ModalPaymentAdd.initDepositSingle('.btn-add-deposit', $('#add-payment-deposit-form'));
    },

    initSearchForm : function() {

        var searchForms = $('.product-search-form-wrapper form');

        searchForms.each(function() {

            var searchForm = $(this);
            searchForm.on('submit', function(e) {
                e.preventDefault();
                foodcoopshop.SelfService.ajaxScan();
                return false;
            });

            if (!foodcoopshop.Helper.isMobile()) {
                foodcoopshop.Helper.initBootstrapSelect(searchForm);
            }
            searchForm.find('select, input[type="text"]').on('change', function() {
                foodcoopshop.SelfService.submitFormIfNotProcessing(searchForm, 'fa-search');
            });

            searchForm.on('submit', function(e) {
                e.preventDefault();
                foodcoopshop.SelfService.ajaxScan();
                return false;
            });

            var inputField = searchForm.find('input[type="text"]');
            if (inputField.length > 0) {
                
                try {
                    var clearBarcode = sessionStorage.getItem('clearCustomerBarcode');
                    if (clearBarcode && inputField.val() === clearBarcode) {
                        inputField.val(''); // Suchfeld leeren
                        sessionStorage.removeItem('clearCustomerBarcode');
                    
                        if (window.history && window.history.replaceState) {
                            window.history.replaceState({}, document.title, window.location.pathname);
                        }
                    }
                } catch (e) {}

                inputField.on('keydown', function(e) {
                    if (e.which === 13 || e.keyCode === 13) {
                        e.preventDefault();
                        var keyword = $.trim($(this).val());
                        if (keyword !== '') {
                            $(this).val(''); // clear immediately so the next scan lands in a clean field
                            foodcoopshop.SelfService.enqueueScan(keyword);
                        }
                    }
                });

                var length = inputField.val().length;
                try {
                    var deferredKeyword = sessionStorage.getItem('selfServiceInitialKeyword');
                    if (deferredKeyword) {
                        inputField.val(deferredKeyword);
                        sessionStorage.removeItem('selfServiceInitialKeyword');
                        setTimeout(function() {
                            searchForm.submit();
                        }, 50);
                    }
                } catch (e) {
                    console.warn('sessionStorage not accessible', e);
                }
                
                length = inputField.val().length;
                inputField[0].setSelectionRange(length, length);
                inputField.focus();
            }

        });
    },

    /**
     * Submits a form only when no scan is currently being processed.
     * Used for manual search (text input change, select change).
     */
    submitFormIfNotProcessing : function(searchForm, icon) {
        if (this.isProcessing) {
            return;
        }
        this.submitForm(searchForm, icon);
    },

    submitForm : function(searchForm, icon) {
        var submitButton = searchForm.find('.btn[type="submit"]');
        foodcoopshop.Helper.addSpinnerToButton(submitButton, icon);
        foodcoopshop.Helper.disableButton(submitButton);
        searchForm.submit();
    },

     ajaxScan: function() {
        var searchForm = $('form#product-search-1');
        var searchInput = searchForm.find('input[name="keyword"]');
        var keyword = searchInput.val();
        
        var requestUrl = searchForm.attr('action');
        if (!requestUrl) {
            requestUrl = '/' + __('route_self_service');
        }
        requestUrl += '?' + searchForm.serialize();
        
        if (keyword != '') {
            searchInput.val('');
        }

        foodcoopshop.Cart.queue.push(function() {
            foodcoopshop.Helper.removeFlashMessage();
            var submitButton = searchForm.find('.btn[type="submit"]');
            foodcoopshop.Helper.addSpinnerToButton(submitButton, 'fa-search');
            foodcoopshop.Helper.disableButton(submitButton);
            
            $.ajax({
                url: requestUrl,
                type: 'GET',
                success: function(response) {
                    try {
                        foodcoopshop.Helper.removeSpinnerFromButton(submitButton, 'fa-search');
                        foodcoopshop.Helper.enableButton(submitButton);
                        
                        var parser = new DOMParser();
                        var doc = parser.parseFromString(response, 'text/html');
                        
                        var flashMessageSuccess = $(doc).find('#flashMessage.success');
                        if (flashMessageSuccess.length > 0) {
                            $('.right-box').replaceWith($(doc).find('.right-box')[0].outerHTML);
                            
                            var cartScriptMatch = response.match(/foodcoopshop\.Cart\.initCartProducts\('(?:[^'\\]|\\.)*'\);/);
                            if (cartScriptMatch) {
                                eval(cartScriptMatch[0]);
                            }
                            
                            foodcoopshop.SelfService.bindQuantityInUnitsInputFields();
                            
                            foodcoopshop.Cart.isProcessing = false;
                            foodcoopshop.Cart.processQueue();
                            foodcoopshop.SelfService.setFocusToSearchInputField();
                        } else if ($(doc).find('#flashMessage.error').length > 0) {
                            foodcoopshop.Helper.showErrorMessage($(doc).find('#flashMessage.error').html());
                            foodcoopshop.SelfService.playErrorSound();
                            foodcoopshop.Cart.isProcessing = false;
                            foodcoopshop.Cart.processQueue();
                            foodcoopshop.SelfService.setFocusToSearchInputField();
                        } else {
                            if ($(doc).find('.product-wrapper').length === 0 && /^\d{4,}$/.test(keyword)) {
                                $('.right-box').replaceWith($(doc).find('.right-box')[0].outerHTML);
                                foodcoopshop.SelfService.bindQuantityInUnitsInputFields();
                                foodcoopshop.Helper.showErrorMessage('Barcode ' + keyword + ' nicht gefunden.');
                                foodcoopshop.SelfService.playErrorSound();
                                foodcoopshop.Cart.isProcessing = false;
                                foodcoopshop.Cart.processQueue();
                                foodcoopshop.SelfService.setFocusToSearchInputField();
                            } else {
                                document.location.href = requestUrl;
                            }
                        }
                    } catch (e) {
                        console.error('AJAX Success processing error: ', e);
                        foodcoopshop.Cart.isProcessing = false;
                        foodcoopshop.Cart.processQueue();
                        foodcoopshop.SelfService.setFocusToSearchInputField();
                    }
                },
                error: function() {
                    foodcoopshop.Helper.removeSpinnerFromButton(submitButton, 'fa-search');
                    foodcoopshop.Helper.enableButton(submitButton);
                    foodcoopshop.Helper.showErrorMessage(__('An_error_occurred'));
                    foodcoopshop.SelfService.playErrorSound();
                    foodcoopshop.Cart.isProcessing = false;
                    foodcoopshop.Cart.processQueue();
                    foodcoopshop.SelfService.setFocusToSearchInputField();
                }
            });
        });
        foodcoopshop.Cart.processQueue();
    },

    playErrorSound: function() {
        try {
            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            var oscillator = audioCtx.createOscillator();
            var gainNode = audioCtx.createGain();

            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(200, audioCtx.currentTime); // Low buzz
            oscillator.frequency.setValueAtTime(150, audioCtx.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
        } catch (e) {
            console.warn('Web Audio API not supported', e);
        }
    },

    barcodeBuffer: '',
    barcodeTimer: null,

    detectDefaultStart: function() {
        var urlParams = new URLSearchParams(window.location.search);
        var startUrl = urlParams.get('selfServiceStartUrl');

        if (startUrl) {
            this.useDefaultStart = true;
            this.defaultStartUrl = startUrl;
            localStorage.setItem('fcs_self_service_start_url', startUrl);
        } else {
            var savedUrl = localStorage.getItem('fcs_self_service_start_url');
            if (savedUrl) {
                this.useDefaultStart = true;
                this.defaultStartUrl = savedUrl;
            } else {
                this.useDefaultStart = false; 
            }
        }
    },

    initDefaultStartUI: function() {
        if (!this.useDefaultStart) return;
        
        var wrapper = $('.self-service-login-button-wrapper');
        if (wrapper.length === 0) return;

        wrapper.empty(); 
        var startUrl = '/' + __('route_self_service');
        var startBtn = $('<a />')
            .attr('href', this.defaultStartUrl)
            .addClass('btn btn-success self-service-general-start-btn')
            .html('SCANNE ein Produkt oder klicke hier zum START');

        wrapper.append(startBtn);
    },

    initGlobalBarcodeScannerListener: function() {
        $(document).on('keypress', function(e) {
            if ($('#LoginForm').length > 0) {
                return;
            }

            if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                foodcoopshop.SelfService.barcodeBuffer += e.key;
                if (foodcoopshop.SelfService.barcodeTimer) clearTimeout(foodcoopshop.SelfService.barcodeTimer);
                foodcoopshop.SelfService.barcodeTimer = setTimeout(function() {
                    foodcoopshop.SelfService.barcodeBuffer = '';
                }, 300);
            } else if (e.key === 'Enter') {
                if (foodcoopshop.SelfService.barcodeBuffer.length >= 4) {
                    var code = foodcoopshop.SelfService.barcodeBuffer;
                    foodcoopshop.SelfService.barcodeBuffer = '';
                    e.preventDefault();
                    
                    var searchInput = $('form#product-search-1 input[name="keyword"]');
                    if (searchInput.length) {
                        searchInput.val(code);
                        searchInput.closest('form').submit();
                        return;
                    }

                    if (foodcoopshop.SelfService.useDefaultStart && foodcoopshop.SelfService.defaultStartUrl) {
                        try {
                            sessionStorage.setItem('selfServiceInitialKeyword', code);
                        } catch (e) {
                            console.warn('sessionStorage not accessible', e);
                        }
                        document.location.href = foodcoopshop.SelfService.defaultStartUrl;
                        return;
                    }
                } else {
                    foodcoopshop.SelfService.barcodeBuffer = '';
                }
            }
        });
    },

    initHighlightedProductIdForMobileBarcodeScanning: function(productId) {
        $('#products').show();
        $('.pw').hide();
        var rowId = '#pw-' + productId;
        $(rowId).show();
        this.initHighlightedProductId(productId);
    },

    initHighlightedProductId: function(productId) {
        var rowId = '#pw-' + productId;
        $.scrollTo(rowId, 1000, {
            offset: {
                top: -100
            }
        });
        $(rowId).css('background-color', '#f3515c');
        $(rowId).css('color', 'white');
        $(rowId).find('.line *').css('color', 'white');
        $(rowId).one('mouseover', function () {
            $(this).find('.line *').removeAttr('style');
            $(this).removeAttr('style');
        });
        $(rowId).find('.quantity-in-units-input-field-wrapper input').focus();
    },

    bindQuantityInUnitsInputFields: function(){
        $('.quantity-in-units-input-field-wrapper input').on('keypress', function(e) {
            if (e.which === 13) {
                if (foodcoopshop.SelfService.barcodeBuffer && foodcoopshop.SelfService.barcodeBuffer.length >= 4) {
                    $(this).val('');
                    return;
                }
                $(this).closest('.ew').find('.btn-cart').trigger('click');
                $(this).val('');
            }
        });
    },

    initCartErrors: function (cartErrors) {
        cartErrors = $.parseJSON(cartErrors);
        for (var key in cartErrors) {
            var container;
            var errorMessageString = '<ul class="error-message ' + key + '"><li>' + cartErrors[key].join('</li><li>') + '</li></ul>';
            if (key == 'global') {
                container = $('#SelfServiceForm');
                container.addClass('error');
                container.prepend(errorMessageString);
            } else {
                container = $('#cart .product.' + key);
                container.addClass('error');
                container.after(errorMessageString);
            }
        }
    },

    initWindowResize: function () {
        $(window).on('resize', function () {
            foodcoopshop.SelfService.onWindowResize();
        });
        foodcoopshop.SelfService.onWindowResize();
    },

    setFocusToSearchInputField : function() {
        var inputField = $('.product-search-form-wrapper input[name="keyword"]');
        inputField.focus();
    },

    onWindowResize : function() {
        $('.right-box').css('max-height', parseInt($(window).height()));
    },

    initAutoLogout : function() {

        this.resetTimer();
        this.renderTimer();

        $(document).idle({
            startAtIdle : true,
            onActive: function(){
                foodcoopshop.SelfService.resetTimer();
                foodcoopshop.SelfService.renderTimer();
            },
            onIdle: function() {
                foodcoopshop.SelfService.currentLogoutTimer--;
                foodcoopshop.SelfService.renderTimer();
                if (foodcoopshop.SelfService.currentLogoutTimer == 0) {
                    document.location.href = '/' + __('route_sign_out') + '?redirect=' + document.location.href;
                }
            },
            recurIdleCall : true,
            idle: 1000
        });

    },

    resetTimer : function() {
        this.currentLogoutTimer = this.autoLogoutTimer;
    },

    renderTimer : function() {
        $('.auto-logout-timer').html(this.currentLogoutTimer);
    }

};