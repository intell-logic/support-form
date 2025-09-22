// Configuración moderna
const CONFIG = {
    netlifyFunction: 'https://support-form-dms.netlify.app/.netlify/functions/tickets',
    tokenEndpoint: '/api/validate-token', // Endpoint para validar tokens
    sessionTimeout: 3, // minutos
    debugMode: false,
    retryAttempts: 3,
    retryDelay: 1000
};

// Estado global usando const para objetos mutables
const AppState = {
    allTickets: [],
    filteredTickets: [],
    isAuthenticated: false,
    sessionTimeout: null
};

// Validaciones del formulario
const validationRules = {
    titulo: {
        required: true,
        minLength: 5,
        message: 'El título es obligatorio y debe tener al menos 5 caracteres'
    },
    descripcion: {
        required: true,
        minLength: 20,
        message: 'La descripción es obligatoria y debe tener al menos 20 caracteres'
    },
    prioridad: {
        required: true,
        message: 'Debes seleccionar una prioridad'
    },
    etiqueta: {
        required: true,
        message: 'Debes seleccionar un tipo de ticket'
    }
};

// ========== GESTIÓN DE TOKENS MODERNA ==========
class TokenManager {
    static STORAGE_KEY = btoa('ticketPortalSession');
    static VALID_TOKENS = ['123456', '654321', '99001199']; // Temporal - mover a backend

    static setToken(token, expirationMinutes = CONFIG.sessionTimeout) {
        const expirationTime = Date.now() + (expirationMinutes * 60 * 1000);
        const sessionData = {
            token: btoa(token),
            expiresAt: expirationTime,
            createdAt: Date.now()
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
        this.scheduleAutoLogout(expirationMinutes);
    }

    static getTokenData() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error parsing token data:', error);
            return null;
        }
    }

    static isValid() {
        const tokenData = this.getTokenData();
        if (!tokenData) return false;

        const isNotExpired = Date.now() < tokenData.expiresAt;
        const isValidToken = this.VALID_TOKENS.includes(atob(tokenData.token));

        return isNotExpired && isValidToken;
    }

    static getTimeRemaining() {
        const tokenData = this.getTokenData();
        if (!tokenData) return 0;

        const remaining = tokenData.expiresAt - Date.now();
        return Math.max(0, remaining);
    }

    static scheduleAutoLogout(minutes) {
        if (AppState.sessionTimeout) {
            clearTimeout(AppState.sessionTimeout);
        }

        AppState.sessionTimeout = setTimeout(() => {
            this.logout('Sesión expirada por tiempo de inactividad');
        }, minutes * 60 * 1000);
    }

    static logout(reason = 'Sesión cerrada manualmente') {
        localStorage.removeItem(this.STORAGE_KEY);
        if (AppState.sessionTimeout) {
            clearTimeout(AppState.sessionTimeout);
            AppState.sessionTimeout = null;
        }
        AppState.isAuthenticated = false;
        AuthUI.showModal(reason);
    }

    static refreshSession() {
        if (this.isValid()) {
            const tokenData = this.getTokenData();
            const currentToken = atob(tokenData.token);
            this.setToken(currentToken, CONFIG.sessionTimeout);
        }
    }
}

// ========== MANEJO DE UI DE AUTENTICACIÓN ==========
class AuthUI {
    static showModal(message = null) {
        const overlay = document.getElementById('authOverlay');
        const container = document.getElementById('mainContainer');
        const errorDiv = document.getElementById('authError');

        overlay.style.display = 'flex';
        container.classList.remove('show');

        if (message) {
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
        } else {
            errorDiv.classList.add('hidden');
        }
    }

    static hideModal() {
        const overlay = document.getElementById('authOverlay');
        const container = document.getElementById('mainContainer');

        overlay.style.display = 'none';
        container.classList.add('show');
    }

    static clearForm() {
        document.getElementById('tokenInput').value = '';
        document.getElementById('authError').classList.add('hidden');
    }
}

// ========== INICIALIZACIÓN DE AUTENTICACIÓN ==========
const initAuth = () => {
    if (TokenManager.isValid()) {
        authenticateUser();
        TokenManager.scheduleAutoLogout(CONFIG.sessionTimeout);
    } else {
        AuthUI.showModal();
    }
};

const authenticateUser = () => {
    AppState.isAuthenticated = true;
    AuthUI.hideModal();
    loadTickets();
};

const logout = (reason) => {
    TokenManager.logout(reason);
};

// ========== NAVEGACIÓN MODERNA ==========
class TabManager {
    static switchTab(tabName, targetElement) {
        // Remover clases activas (usar clases BEM)
        document.querySelectorAll('.nav__tab').forEach(tab =>
            tab.classList.remove('nav__tab--active')
        );
        document.querySelectorAll('.tab').forEach(content =>
            content.classList.remove('tab--active')
        );

        // Activar tab seleccionado (usar clases BEM)
        targetElement.classList.add('nav__tab--active');
        document.getElementById(`${tabName}Tab`).classList.add('tab--active');

        // Limpiar mensajes al cambiar a portal
        if (tabName === 'portal') {
            MessageManager.clearMessages();
        }
    }
}

// Función global para compatibilidad con HTML
const switchTab = (tabName) => {
    TabManager.switchTab(tabName, event.target);
};

// ========== GESTIÓN DE TICKETS MODERNA ==========
class TicketManager {
    static async loadTickets() {
        if (!AppState.isAuthenticated) return;

        try {
            UIManager.showLoading(true);

            const response = await this.fetchWithRetry(CONFIG.netlifyFunction, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: No se pudo obtener los tickets`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Error desconocido');
            }

            AppState.allTickets = data.tickets || [];
            AppState.filteredTickets = [...AppState.allTickets];
            this.displayTickets(AppState.filteredTickets);

            if (CONFIG.debugMode) {
                console.log(`✅ Loaded ${AppState.allTickets.length} tickets from backend`);
            }

        } catch (error) {
            console.error('❌ Error loading tickets:', error);
            UIManager.showPortalError(`Error cargando tickets: ${error.message}`);
        } finally {
            UIManager.showLoading(false);
        }
    }

    static async fetchWithRetry(url, options, attempts = CONFIG.retryAttempts) {
        for (let i = 0; i < attempts; i++) {
            try {
                const response = await fetch(url, options);
                if (response.ok || i === attempts - 1) {
                    return response;
                }
                throw new Error(`HTTP ${response.status}`);
            } catch (error) {
                if (i === attempts - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay * (i + 1)));
            }
        }
    }

    static displayTickets(tickets) {
        const container = document.getElementById('ticketsContainer');

        if (tickets.length === 0) {
            container.innerHTML = `
                <div class="portal__no-tickets">
                    <h3>No se encontraron tickets</h3>
                    <p>No hay solicitudes que coincidan con tu búsqueda.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = tickets.map(ticket => this.createTicketCard(ticket)).join('');
    }

    static createTicketCard(ticket) {
        const {
            statusClass = this.getStatusClass(ticket.status?.status),
            priorityClass = `priority-${ticket.priority?.priority || 4}`,
            priorityText = this.getPriorityText(ticket.priority?.priority),
            ticketId = this.extractTicketId(ticket.description)
        } = {};

        return `
            <div class="ticket-card">
                <div class="ticket-card__header">
                    <div>
                        <div class="ticket-card__id">${ticketId || ticket.id}</div>
                        <div class="ticket-card__title">${ticket.name}</div>
                    </div>
                    <div class="status-badge status-badge--${statusClass}">
                        ${this.translateStatus(ticket.status?.status)}
                    </div>
                </div>

                <div class="ticket-card__meta">
                    <div class="ticket-meta-item">
                        <span class="ticket-meta-item__icon">📅</span>
                        <span>${this.formatDate(ticket.date_created)}</span>
                    </div>
                    <div class="ticket-meta-item">
                        <span class="ticket-meta-item__icon">🚨</span>
                        <span class="priority-badge priority-badge--${priorityClass}">${priorityText}</span>
                    </div>
                    ${ticket.assignees?.length > 0 ? `
                        <div class="ticket-meta-item">
                            <span class="ticket-meta-item__icon">👤</span>
                            <span>${ticket.assignees[0].username}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="ticket-card__description">
                    ${this.formatDescription(ticket.description)}
                </div>

                <div class="ticket-card__tags">
                    ${ticket.tags.map(tag => `<span class="ticket-tag">${tag.name}</span>`).join('')}
                </div>
            </div>
        `;
    }

    static searchTickets() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();

        if (!searchTerm) {
            AppState.filteredTickets = [...AppState.allTickets];
        } else {
            AppState.filteredTickets = AppState.allTickets.filter(ticket => {
                const ticketId = this.extractTicketId(ticket.description);
                return (
                    ticket.name.toLowerCase().includes(searchTerm) ||
                    ticket.description.toLowerCase().includes(searchTerm) ||
                    (ticketId && ticketId.toLowerCase().includes(searchTerm))
                );
            });
        }

        this.displayTickets(AppState.filteredTickets);
    }

    // Métodos auxiliares
    static getStatusClass(status) {
        const statusMap = {
            'tickets': 'todo',
            'en curso': 'progress',
            'promovido': 'done',
            'por revisar': 'todo'
        };
        return statusMap[status?.toLowerCase()] || 'todo';
    }

    static translateStatus(status) {
        const statusMap = {
            'to do': 'Pendiente',
            'in progress': 'En Progreso',
            'done': 'Completado',
            'closed': 'Cerrado'
        };
        return statusMap[status?.toLowerCase()] || status;
    }

    static getPriorityText(priority) {
        const priorityMap = {
            'urgent': 'Urgente',
            'high': 'Alta',
            'normal': 'Media',
            'low': 'Baja'
        };
        return priorityMap[priority] || 'Media';
    }

    static formatDate(dateString) {
        return new Date(parseInt(dateString)).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static extractTicketId(description) {
        const match = description.match(/Ticket ID:\*\* (TICKET-[^\n\s]+)/);
        return match?.[1] || null;
    }

    static formatDescription(description) {
        const match = description.match(/\*\*📝 Descripción del Cliente:\*\*\s*([^*]+)/);
        if (match) {
            return match[1].trim().substring(0, 200) + '...';
        }
        return description.substring(0, 200) + '...';
    }
}

// Funciones globales para compatibilidad
const loadTickets = () => TicketManager.loadTickets();
const searchTickets = () => TicketManager.searchTickets();


// ========== FORMULARIO DE TICKETS ==========







// ========== EVENT LISTENERS ==========

function initEventListeners() {
    // Event listeners para auth
    document.getElementById('authBtn').addEventListener('click', function() {
        const token = document.getElementById('tokenInput').value.trim();
        const errorDiv = document.getElementById('authError');

        if (CONFIG.validTokens.includes(token)) {
            localStorage.setItem('ticketPortalTk', btoa(token));
            errorDiv.classList.add('hidden');
            document.getElementById('tokenInput').value = '';
            authenticateUser();
            setInterval(() => {
                if (isAuthenticated) {
                    logout();
                }
            }, (1000 * 60) * 30);
        } else {
            errorDiv.textContent = 'Token inválido. Contacta al administrador.';
            errorDiv.classList.remove('hidden');
        }
    });

}

// ========== GESTIÓN DE UI ==========
class UIManager {
    static showLoading(show) {
        const loadingElement = document.getElementById('loadingMessage');
        if (loadingElement) {
            loadingElement.classList.toggle('hidden', !show);
        }
    }

    static showPortalError(message) {
        const errorElement = document.getElementById('portalError');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        }
    }

    static setSubmitLoading(isLoading) {
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            if (isLoading) {
                submitBtn.innerHTML = '<span class="loading"></span>Enviando...';
                submitBtn.disabled = true;
            } else {
                submitBtn.innerHTML = 'Crear Ticket';
                submitBtn.disabled = false;
            }
        }
    }
}

// ========== GESTIÓN DE MENSAJES ==========
class MessageManager {
    static clearMessages() {
        const elements = ['successMessage', 'errorMessage'];
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.add('hidden');
            }
        });
    }

    static showTemporaryMessage(element, duration = 5000) {
        if (!element) return;

        element.classList.remove('hidden');
        element.scrollIntoView({ behavior: 'smooth' });

        setTimeout(() => {
            this.fadeOut(element);
        }, duration);
    }

    static fadeOut(element) {
        if (!element) return;

        Object.assign(element.style, {
            opacity: '0',
            transform: 'translateY(-20px)',
            transition: 'all 0.5s ease'
        });

        setTimeout(() => {
            element.classList.add('hidden');
            Object.assign(element.style, {
                opacity: '1',
                transform: 'translateY(0)',
                transition: ''
            });
        }, 500);
    }
}

// ========== VALIDACIÓN DE FORMULARIOS ==========
class FormValidator {
    static showFieldError(fieldName, message) {
        const field = document.getElementById(fieldName);
        const errorElement = document.getElementById(`${fieldName}-error`);

        if (field) {
            field.classList.add('form__input--error', 'form__select--error', 'form__textarea--error');
            field.classList.remove('form__input--success', 'form__select--success', 'form__textarea--success');
        }

        if (errorElement) {
            if (message) {
                errorElement.textContent = message;
            }
            errorElement.classList.add('form__error--show');
        }
    }

    static showFieldSuccess(fieldName) {
        const field = document.getElementById(fieldName);
        const errorElement = document.getElementById(`${fieldName}-error`);

        if (field) {
            field.classList.remove('form__input--error', 'form__select--error', 'form__textarea--error');
            field.classList.add('form__input--success', 'form__select--success', 'form__textarea--success');
        }

        if (errorElement) {
            errorElement.classList.remove('form__error--show');
        }
    }

    static validateField(fieldName, value) {
        const rules = validationRules[fieldName];
        if (!rules) return true;

        if (rules.required && (!value || value.trim().length === 0)) {
            this.showFieldError(fieldName, rules.message);
            return false;
        }

        if (rules.minLength && value.trim().length < rules.minLength) {
            this.showFieldError(fieldName, rules.message);
            return false;
        }

        this.showFieldSuccess(fieldName);
        return true;
    }

    static validateForm() {
        const formData = new FormData(document.getElementById('ticketForm'));

        return Object.keys(validationRules).every(fieldName => {
            const value = formData.get(fieldName) || '';
            return this.validateField(fieldName, value);
        });
    }

    static clearValidationErrors() {
        document.querySelectorAll('.form__error').forEach(el =>
            el.classList.remove('form__error--show')
        );
        document.querySelectorAll('.form__input, .form__select, .form__textarea').forEach(el => {
            el.classList.remove(
                'form__input--error', 'form__select--error', 'form__textarea--error',
                'form__input--success', 'form__select--success', 'form__textarea--success'
            );
        });
    }
}

// ========== GESTIÓN DE TICKETS (ENVIO) ==========
class TicketSubmission {
    static generateTicketId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 5);
        return `TICKET-${timestamp}-${random}`.toUpperCase();
    }

    static async sendViaNetlify(ticketData) {
        try {
            if (CONFIG.debugMode) {
                console.log('📤 Enviando vía Netlify Functions:', ticketData);
            }

            const response = await TicketManager.fetchWithRetry(CONFIG.netlifyFunction, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Ticket-Form/1.0'
                },
                body: JSON.stringify(ticketData)
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Error ${response.status}: ${errorData}`);
            }

            const result = await response.json();

            if (CONFIG.debugMode) {
                console.log('✅ Respuesta Netlify:', result);
            }

            return result;

        } catch (error) {
            console.error('❌ Error Netlify:', error);
            throw error;
        }
    }

    static createTicketData(formData) {
        return {
            id: this.generateTicketId(),
            titulo: formData.get('titulo').trim(),
            descripcion: formData.get('descripcion').trim(),
            prioridad: formData.get('prioridad'),
            etiqueta: formData.get('etiqueta'),
            fechaCreacion: new Date().toISOString(),
            fechaLocal: new Date().toLocaleString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            estado: 'nuevo',
            origen: 'formulario-web',
            cliente: {
                userAgent: navigator.userAgent,
                idioma: navigator.language,
                plataforma: navigator.platform,
                timestamp: Date.now(),
                url: window.location.href,
                referrer: document.referrer || 'directo'
            },
            clickupData: {
                prioridad_numerica: this.getPriorityNumber(formData.get('prioridad')),
                tags: [
                    'formulario-web',
                    formData.get('etiqueta'),
                    `prioridad-${formData.get('prioridad')}`,
                    'sin-asignar'
                ],
                estado_inicial: 'to do'
            }
        };
    }

    static getPriorityNumber(prioridad) {
        const priorityMap = {
            'urgente': 1,
            'alta': 2,
            'media': 3,
            'baja': 4
        };
        return priorityMap[prioridad] || 3;
    }
}

// ========== MANEJO DE EVENTOS ==========
class EventManager {
    static initEventListeners() {
        this.initAuthEvents();
        this.initFormEvents();
        this.initSearchEvents();
    }

    static initAuthEvents() {
        const authBtn = document.getElementById('authBtn');
        const tokenInput = document.getElementById('tokenInput');
        const logoutBtn = document.getElementById('logoutBtn');

        authBtn.addEventListener('click', () => {
            const token = tokenInput.value.trim();
            const errorDiv = document.getElementById('authError');

            if (TokenManager.VALID_TOKENS.includes(token)) {
                TokenManager.setToken(token);
                errorDiv.classList.add('hidden');
                tokenInput.value = '';
                authenticateUser();
            } else {
                errorDiv.textContent = 'Token inválido. Contacta al administrador.';
                errorDiv.classList.remove('hidden');
            }
        });

        tokenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                authBtn.click();
            }
        });

        tokenInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });

        logoutBtn.addEventListener('click', () => logout());
    }

    static initFormEvents() {
        const ticketForm = document.getElementById('ticketForm');

        ticketForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleFormSubmit(e);
        });

        // Validación en tiempo real
        const formInputs = ticketForm.querySelectorAll('input, select, textarea');
        formInputs.forEach(input => this.attachValidationEvents(input));
    }

    static async handleFormSubmit(event) {
        MessageManager.clearMessages();

        if (!FormValidator.validateForm()) {
            const errorMsg = document.getElementById('errorMessage');
            errorMsg.textContent = '❌ Por favor, corrige los errores antes de continuar.';
            MessageManager.showTemporaryMessage(errorMsg, 5000);
            return;
        }

        UIManager.setSubmitLoading(true);

        try {
            const formData = new FormData(event.target);
            const ticketData = TicketSubmission.createTicketData(formData);

            await TicketSubmission.sendViaNetlify(ticketData);

            const successMsg = document.getElementById('successMessage');
            successMsg.textContent = '✅ Tu ticket ha sido enviado exitosamente. Te contactaremos pronto.';
            MessageManager.showTemporaryMessage(successMsg, 5000);

            event.target.reset();
            FormValidator.clearValidationErrors();

            // Recargar tickets después de crear uno nuevo
            setTimeout(() => TicketManager.loadTickets(), 2000);

        } catch (error) {
            console.error('Error:', error);
            const errorMsg = document.getElementById('errorMessage');
            errorMsg.textContent = '❌ Error al procesar el ticket. Por favor, intenta nuevamente.';
            MessageManager.showTemporaryMessage(errorMsg, 5000);
        } finally {
            UIManager.setSubmitLoading(false);
        }
    }

    static attachValidationEvents(input) {
        let validationTimeout;

        input.addEventListener('input', function() {
            clearTimeout(validationTimeout);
            validationTimeout = setTimeout(() => {
                if (this.value.trim().length > 0) {
                    FormValidator.validateField(this.name, this.value);
                }
            }, 500);
        });

        input.addEventListener('blur', function() {
            if (validationRules[this.name]) {
                FormValidator.validateField(this.name, this.value);
            }
        });

        input.addEventListener('focus', function() {
            const hasError = this.classList.contains('form__input--error') ||
                           this.classList.contains('form__select--error') ||
                           this.classList.contains('form__textarea--error');

            if (hasError) {
                this.classList.remove('form__input--error', 'form__select--error', 'form__textarea--error');
                const errorElement = document.getElementById(`${this.name}-error`);
                errorElement?.classList.remove('form__error--show');
            }
        });
    }

    static initSearchEvents() {
        const searchInput = document.getElementById('searchInput');

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                TicketManager.searchTickets();
            }
        });
    }
}

// ========== INICIALIZACIÓN DE LA APLICACIÓN ==========
class App {
    static init() {
        console.log('🎟️ Portal Tickets inicializado - Versión ES6+');
        console.log('🔐 Sistema de autenticación con JWT habilitado');

        initAuth();
        EventManager.initEventListeners();
        this.startAutoRefresh();
        this.startSessionMonitor();
    }

    static startAutoRefresh() {
        // Auto-reload de tickets cada 30 segundos
        setInterval(() => {
            if (AppState.isAuthenticated) {
                TicketManager.loadTickets();
            }
        }, 30000);
    }

    static startSessionMonitor() {
        // Verificar sesión cada minuto
        setInterval(() => {
            if (AppState.isAuthenticated && !TokenManager.isValid()) {
                TokenManager.logout('Sesión expirada');
            }
        }, 60000);
    }
}

// Inicializar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => App.init());

// Funciones globales para compatibilidad con HTML (mantener para onclick)
window.switchTab = switchTab;
window.searchTickets = () => TicketManager.searchTickets();