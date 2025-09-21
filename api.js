// api.js - Añadir en la raíz de tu repositorio
class TicketAPI {
  constructor() {
    this.githubToken = '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'; // Token público limitado
    this.repoOwner = 'intell-logic';
    this.repoName = 'support-form'; // Nombre de tu repositorio
  }

  async sendTicket(ticketData) {
    try {
      console.log('📤 Enviando ticket vía GitHub Actions...');
      
      const response = await fetch(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Ticket-Form/1.0'
        },
        body: JSON.stringify({
          event_type: 'ticket_created',
          client_payload: {
            ...ticketData,
            timestamp: new Date().toISOString(),
            source: 'github-pages-form'
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`GitHub API Error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      console.log('✅ Ticket enviado a GitHub Actions');
      
      // GitHub Actions no retorna datos del task, pero podemos simular respuesta
      return {
        success: true,
        message: 'Ticket enviado para procesamiento',
        ticketId: ticketData.id,
        status: 'processing'
      };

    } catch (error) {
      console.error('❌ Error enviando ticket:', error);
      throw error;
    }
  }
}

// Instancia global
window.TicketAPI = new TicketAPI();
