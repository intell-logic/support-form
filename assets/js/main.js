// Configuración
const CONFIG = {
    netlifyFunction: 'https://support-form-dms.netlify.app/.netlify/functions/tickets',
    validTokens: ['123456', '654321', '99001199'], // Tokens válidos
    debugMode: false
};

// Estado global
let allTickets = [];
let filteredTickets = [];
let isAuthenticated = false;

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

// ========== AUTENTICACIÓN ==========
function initAuth() {
    const savedToken = atob(localStorage.getItem('ticketPortalTk'));
    if (savedToken && CONFIG.validTokens.includes(savedToken)) {
        authenticateUser();
    } else {
        showAuthModal();
    }
}

function showAuthModal() {
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('mainContainer').classList.remove('show');
}

function hideAuthModal() {
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('mainContainer').classList.add('show');
}

function authenticateUser() {
    isAuthenticated = true;
    hideAuthModal();
    loadTickets();
}

function logout() {
    localStorage.removeItem('ticketPortalTk');
    isAuthenticated = false;
    showAuthModal();
}

// ========== NAVEGACIÓN ==========
function switchTab(tabName) {
    // Actualizar tabs
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Limpiar formulario si se cambia a portal
    if (tabName === 'portal') {
        clearMessages();
    }
}

// ========== PORTAL DE TICKETS ==========
async function loadTickets() {
    if (!isAuthenticated) return;

    try {
        showLoading(true);

        // Usar GET request al backend para mayor seguridad
        const response = await fetch(CONFIG.netlifyFunction, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: No se pudo obtener los tickets`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error desconocido');
        }

        allTickets = data.tickets || [];
        filteredTickets = [...allTickets];
        displayTickets(filteredTickets);

        if (CONFIG.debugMode) {
            console.log(`✅ Loaded ${allTickets.length} tickets from backend`);
        }

    } catch (error) {
        console.error('❌ Error loading tickets:', error);
        showPortalError(`Error cargando tickets: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function displayTickets(tickets) {
    const container = document.getElementById('ticketsContainer');

    if (tickets.length === 0) {
        container.innerHTML = `
            <div class="no-tickets">
                <h3>No se encontraron tickets</h3>
                <p>No hay solicitudes que coincidan con tu búsqueda.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tickets.map(ticket => {
        const statusClass = getStatusClass(ticket.status.status);
        const priorityClass = `priority-${ticket.priority?.priority || 4}`;
        const priorityText = getPriorityText(ticket.priority?.priority);
        const ticketId = extractTicketId(ticket.description);

        return `
            <div class="ticket-card">
                <div class="ticket-header">
                    <div>
                        <div class="ticket-id">${ticketId || ticket.id}</div>
                        <div class="ticket-title">${ticket.name}</div>
                    </div>
                    <div class="status-badge ${statusClass}">
                        ${translateStatus(ticket.status.status)}
                    </div>
                </div>

                <div class="ticket-meta">
                    <div class="ticket-meta-item">
                        📅 <span>${formatDate(ticket.date_created)}</span>
                    </div>
                    <div class="ticket-meta-item">
                        🚨 <span class="priority-badge ${priorityClass}">${priorityText}</span>
                    </div>
                    ${ticket.assignees && ticket.assignees.length > 0 ? `
                        <div class="ticket-meta-item">
                            👤 <span>${ticket.assignees[0].username}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="ticket-description">
                    ${formatDescription(ticket.description)}
                </div>

                <div class="ticket-tags">
                    ${ticket.tags.map(tag => `<span class="ticket-tag">${tag.name}</span>`).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function searchTickets() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    if (!searchTerm) {
        filteredTickets = [...allTickets];
    } else {
        filteredTickets = allTickets.filter(ticket => {
            const ticketId = extractTicketId(ticket.description);
            return (
                ticket.name.toLowerCase().includes(searchTerm) ||
                ticket.description.toLowerCase().includes(searchTerm) ||
                (ticketId && ticketId.toLowerCase().includes(searchTerm))
            );
        });
    }

    displayTickets(filteredTickets);
}

// Funciones auxiliares del portal
function getStatusClass(status) {
    const statusMap = {
        'tickets': 'status-todo',
        'en curso': 'status-progress',
        'promovido': 'status-done',
        'por revisar': 'status-todo'
    };
    return statusMap[status.toLowerCase()] || 'status-todo';
}

function translateStatus(status) {
    const statusMap = {
        'to do': 'Pendiente',
        'in progress': 'En Progreso',
        'done': 'Completado',
        'closed': 'Cerrado'
    };
    return statusMap[status.toLowerCase()] || status;
}

function getPriorityText(priority) {
    const priorityMap = {
        'urgent': 'Urgente',
        'high': 'Alta',
        'normal': 'Media',
        'low': 'Baja'
    };
    return priorityMap[priority] || 'Media';
}

function formatDate(dateString) {
    return new Date(parseInt(dateString)).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function extractTicketId(description) {
    const match = description.match(/Ticket ID:\*\* (TICKET-[^\n\s]+)/);
    return match ? match[1] : null;
}

function formatDescription(description) {
    const match = description.match(/\*\*📝 Descripción del Cliente:\*\*\s*([^*]+)/);
    if (match) {
        return match[1].trim().substring(0, 200) + '...';
    }
    return description.substring(0, 200) + '...';
}

function showLoading(show) {
    const loadingElement = document.getElementById('loadingMessage');
    if (show) {
        loadingElement.classList.remove('hidden');
    } else {
        loadingElement.classList.add('hidden');
    }
}

function showPortalError(message) {
    const errorElement = document.getElementById('portalError');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
}

// ========== FORMULARIO DE TICKETS ==========

// Funciones de validación
function showFieldError(fieldName, message) {
    const field = document.getElementById(fieldName);
    const errorElement = document.getElementById(`${fieldName}-error`);

    field.classList.add('error');
    field.classList.remove('success');

    if (message) {
        errorElement.textContent = message;
    }
    errorElement.classList.add('show');
}

function showFieldSuccess(fieldName) {
    const field = document.getElementById(fieldName);
    const errorElement = document.getElementById(`${fieldName}-error`);

    field.classList.remove('error');
    field.classList.add('success');
    errorElement.classList.remove('show');
}

function validateField(fieldName, value) {
    const rules = validationRules[fieldName];
    if (!rules) return true;

    if (rules.required && (!value || value.trim().length === 0)) {
        showFieldError(fieldName, rules.message);
        return false;
    }

    if (rules.minLength && value.trim().length < rules.minLength) {
        showFieldError(fieldName, rules.message);
        return false;
    }

    showFieldSuccess(fieldName);
    return true;
}

function validateForm() {
    let isValid = true;
    const formData = new FormData(document.getElementById('ticketForm'));

    Object.keys(validationRules).forEach(fieldName => {
        const value = formData.get(fieldName) || '';
        if (!validateField(fieldName, value)) {
            isValid = false;
        }
    });

    return isValid;
}

function clearMessages() {
    document.getElementById('successMessage').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
}

function clearValidationErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.classList.remove('show');
    });
    document.querySelectorAll('input, select, textarea').forEach(el => {
        el.classList.remove('error', 'success');
    });
}

function showTemporaryMessage(element, duration = 5000) {
    element.classList.remove('hidden');
    element.scrollIntoView({ behavior: 'smooth' });

    setTimeout(() => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(-20px)';
        element.style.transition = 'all 0.5s ease';

        setTimeout(() => {
            element.classList.add('hidden');
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
            element.style.transition = '';
        }, 500);
    }, duration);
}

function setLoading(isLoading) {
    const submitBtn = document.getElementById('submitBtn');
    if (isLoading) {
        submitBtn.innerHTML = '<span class="loading"></span>Enviando...';
        submitBtn.disabled = true;
    } else {
        submitBtn.innerHTML = 'Crear Ticket';
        submitBtn.disabled = false;
    }
}

function generateTicketId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 5);
    return `TICKET-${timestamp}-${random}`.toUpperCase();
}

async function sendViaNetlify(ticketData) {
    try {
        if (CONFIG.debugMode) {
            console.log('📤 Enviando vía Netlify Functions:', ticketData);
        }

        const response = await fetch(CONFIG.netlifyFunction, {
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

    document.getElementById('tokenInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('authBtn').click();
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Formulario
    document.getElementById('ticketForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        clearMessages();

        if (!validateForm()) {
            document.getElementById('errorMessage').textContent = '❌ Por favor, corrige los errores antes de continuar.';
            showTemporaryMessage(document.getElementById('errorMessage'), 5000);
            return;
        }

        setLoading(true);

        const formData = new FormData(e.target);
        const ticketData = {
            id: generateTicketId(),
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
                prioridad_numerica: formData.get('prioridad') === 'urgente' ? 1 :
                                   formData.get('prioridad') === 'alta' ? 2 :
                                   formData.get('prioridad') === 'media' ? 3 : 4,
                tags: [
                    'formulario-web',
                    formData.get('etiqueta'),
                    `prioridad-${formData.get('prioridad')}`,
                    'sin-asignar'
                ],
                estado_inicial: 'to do'
            }
        };

        try {
            await sendViaNetlify(ticketData);

            document.getElementById('successMessage').textContent = '✅ Tu ticket ha sido enviado exitosamente. Te contactaremos pronto.';
            showTemporaryMessage(document.getElementById('successMessage'), 5000);

            document.getElementById('ticketForm').reset();
            clearValidationErrors();

            // Recargar tickets para mostrar el nuevo
            setTimeout(() => {
                // switchTab('portal');
                loadTickets();
            }, 2000);

        } catch (error) {
            console.error('Error:', error);
            document.getElementById('errorMessage').textContent = '❌ Error al procesar el ticket. Por favor, intenta nuevamente.';
            showTemporaryMessage(document.getElementById('errorMessage'), 5000);
        } finally {
            setLoading(false);
        }
    });

    // Validación en tiempo real
    document.querySelectorAll('#ticketForm input, #ticketForm select, #ticketForm textarea').forEach(input => {
        let validationTimeout;

        input.addEventListener('input', function() {
            clearTimeout(validationTimeout);
            validationTimeout = setTimeout(() => {
                if (this.value.trim().length > 0) {
                    validateField(this.name, this.value);
                }
            }, 500);
        });

        input.addEventListener('blur', function() {
            if (validationRules[this.name]) {
                validateField(this.name, this.value);
            }
        });

        input.addEventListener('focus', function() {
            if (this.classList.contains('error')) {
                this.classList.remove('error');
                const errorElement = document.getElementById(`${this.name}-error`);
                if (errorElement) {
                    errorElement.classList.remove('show');
                }
            }
        });
    });

    // Búsqueda
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchTickets();
        }
    });

    // Solo números en token input
    document.getElementById('tokenInput').addEventListener('input', function(e) {
        this.value = this.value.replace(/[^0-9]/g, '');
    });
}

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎫 Portal Tickets inicializado');
    console.log('🔐 Sistema de autenticación activado');

    initAuth();
    initEventListeners();

    // Auto-reload de tickets cada 30 segundos
    setInterval(() => {
        if (isAuthenticated) {
            loadTickets();
        }
    }, 30000);
});