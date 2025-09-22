exports.handler = async (event, context) => {
  console.log('🎫 Netlify Function iniciada');
  
  // Headers CORS para GitHub Pages
  const headers = {
    'Access-Control-Allow-Origin': 'https://intell-logic.github.io',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  // Manejar preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    console.log('📋 Handling OPTIONS preflight');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight OK' })
    };
  }

  // Variables de entorno ClickUp
  const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
  const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID;
  
  if (!CLICKUP_TOKEN || !CLICKUP_LIST_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Variables de entorno ClickUp no configuradas'
      })
    };
  }

  // ========== GET: Obtener tickets ==========
  if (event.httpMethod === 'GET') {
    try {
      console.log('📥 GET request - Obteniendo tickets');
      
      const response = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task?include_closed=false`, {
        headers: {
          'Authorization': CLICKUP_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ClickUp API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Filtrar solo tickets del formulario web
      const webTickets = data.tasks.filter(task => 
        task.tags && task.tags.some(tag => tag.name === 'formulario-web')
      );

      console.log(`📊 Found ${webTickets.length} web form tickets`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tickets: webTickets,
          count: webTickets.length,
          retrievedAt: new Date().toISOString()
        })
      };

    } catch (error) {
      console.error('❌ GET Error:', error.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Error obteniendo tickets',
          details: error.message
        })
      };
    }
  }

  // ========== POST: Crear ticket ==========
  if (event.httpMethod === 'POST') {
    try {
      // Parse ticket data
      const ticketData = JSON.parse(event.body);
      console.log('📥 POST request - Ticket data received:', {
        id: ticketData.id,
        titulo: ticketData.titulo,
        prioridad: ticketData.prioridad,
        etiqueta: ticketData.etiqueta
      });
      
      // Validar datos requeridos
      if (!ticketData.titulo || !ticketData.descripcion) {
        throw new Error('Título y descripción son requeridos');
      }
      
      // Mapear prioridad a números de ClickUp
      let priorityNumber = 3; // Default: media
      if (ticketData.prioridad === 'urgente') {
        priorityNumber = 1;
      } else if (ticketData.prioridad === 'alta') {
        priorityNumber = 2;
      } else if (ticketData.prioridad === 'media') {
        priorityNumber = 3;
      } else if (ticketData.prioridad === 'baja') {
        priorityNumber = 4;
      }
      
      // Preparar descripción formateada
      const descripcionFormateada = `🎫 **Ticket ID:** ${ticketData.id}
📅 **Fecha:** ${ticketData.fechaLocal || new Date().toLocaleString('es-ES')}
🏷️ **Tipo:** ${ticketData.etiqueta}
🚨 **Prioridad:** ${ticketData.prioridad}

**📝 Descripción del Cliente:**
${ticketData.descripcion}

**🔍 Información Técnica:**
- 🌐 User Agent: ${ticketData.cliente?.userAgent?.substring(0, 100) || 'N/A'}...
- 🖥️ Plataforma: ${ticketData.cliente?.plataforma || 'N/A'}
- 📄 Referrer: ${ticketData.cliente?.referrer || 'Directo'}

---
*✨ Procesado automáticamente vía Netlify Functions*
*⏰ Timestamp: ${new Date().toLocaleString('es-ES')}*`;
      
      // Preparar task para ClickUp
      const clickupTask = {
        name: ticketData.titulo,
        description: descripcionFormateada,
        priority: priorityNumber,
        status: 'TICKETS',
        tags: [
          'formulario-web',
          ticketData.etiqueta,
          'prioridad-' + ticketData.prioridad
        ]
      };

      console.log('📤 Enviando a ClickUp:', {
        name: clickupTask.name,
        priority: clickupTask.priority,
        tags: clickupTask.tags
      });

      // Enviar a ClickUp API
      const clickupResponse = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`, {
        method: 'POST',
        headers: {
          'Authorization': CLICKUP_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(clickupTask)
      });

      if (!clickupResponse.ok) {
        const errorText = await clickupResponse.text();
        console.error('❌ ClickUp API Error:', clickupResponse.status, errorText);
        throw new Error(`ClickUp API Error: ${clickupResponse.status} - ${errorText}`);
      }

      const clickupResult = await clickupResponse.json();
      console.log('✅ ClickUp Task Created:', clickupResult.id, clickupResult.url);

      // Respuesta exitosa
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Ticket creado exitosamente en ClickUp',
          ticketId: ticketData.id,
          clickupTask: {
            id: clickupResult.id,
            url: clickupResult.url,
            name: clickupResult.name
          },
          processedAt: new Date().toISOString()
        })
      };

    } catch (error) {
      console.error('❌ POST Error:', error.message);
      console.error('Stack:', error.stack);
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Error procesando ticket',
          details: error.message,
          timestamp: new Date().toISOString()
        })
      };
    }
  }

  // Método no permitido
  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({
      success: false,
      error: 'Method not allowed. Use GET or POST.'
    })
  };
};
