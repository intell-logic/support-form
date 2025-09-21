exports.handler = async (event, context) => {
  console.log('🎫 Netlify Function iniciada');
  
  // Headers CORS para GitHub Pages
  const headers = {
    'Access-Control-Allow-Origin': 'https://intell-logic.github.io',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  // Solo aceptar POST requests
  if (event.httpMethod !== 'POST') {
    console.log('❌ Method not allowed:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Method not allowed. Use POST.' 
      })
    };
  }

  try {
    // Parse ticket data
    const ticketData = JSON.parse(event.body);
    console.log('📥 Ticket data received:', {
      id: ticketData.id,
      titulo: ticketData.titulo,
      prioridad: ticketData.prioridad,
      etiqueta: ticketData.etiqueta
    });
    
    // Validar datos requeridos
    if (!ticketData.titulo || !ticketData.descripcion) {
      throw new Error('Título y descripción son requeridos');
    }
    
    // ClickUp Configuration desde variables de entorno
    const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
    const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID;
    
    if (!CLICKUP_TOKEN || !CLICKUP_LIST_ID) {
      throw new Error('Variables de entorno ClickUp no configuradas');
    }
    
    // Preparar task para ClickUp
    const clickupTask = {
      name: ticketData.titulo,
      description: `🎫 **Ticket ID:** ${ticketData.id}
📅 **Fecha:** ${ticketData.fechaLocal || new Date().toLocaleString('es-ES')}
🏷️ **Tipo:** ${ticketData.etiqueta}
🚨 **Prioridad:** ${ticketData.prioridad}

**📝 Descripción del Cliente:**
${ticketData.descripcion}

**🔍 Información Técnica:**
- 🌐 User Agent: ${ticketData.cliente?.userAgent?.substring(0, 100) || 'N/A'}...
- 🖥️ Plataforma: ${ticketData.cliente?.plataforma || 'N/A'}
- 🗣️ Idioma: ${ticketData.cliente?.idioma || 'N/A'}
- 🌍 URL Origen: ${ticketData.cliente?.url || 'N/A'}
- 📄 Referrer: ${ticketData.cliente?.referrer || 'Directo'}

---
*✨ Procesado automáticamente vía Netlify Functions*
*⏰ Timestamp: ${new Date().toLocaleString('es-ES')}*`,
      
      // Mapear prioridad (ClickUp: 1=urgent, 4=low)
      priority: ticketData.prioridad === 'urgente' ? 1 :
                ticketData.prioridad === 'alta' ? 2 :
                ticketData.prioridad === 'media' ? 3 : 4,
      
      status: 'to do',
      
      tags: [
        'formulario-web',
        ticketData.etiqueta,
        `prioridad-${ticketData.prioridad}`,
        'netlify-functions',
        'automatico'
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
    console.error('❌ Function Error:', error.message);
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
};
