type Restriction = {isActive?: boolean; timeEnforcementEnds?: Date};
export class SendGate {
  private until = 0;
  private pending: Promise<boolean> | null = null;
  reason: string | null = 'A verificar autorização de envio do WhatsApp.';
  constructor(private now = () => Date.now()) {}
  reset() { this.until = 0; this.reason = 'A verificar autorização de envio do WhatsApp.'; }
  reject() { this.until = this.now() + 60000; this.reason = 'Envios suspensos: o WhatsApp rejeitou o envio com o código 463. A restrição será consultada novamente.'; }
  async allowed(fetch: () => Promise<Restriction>): Promise<boolean> {
    if (this.now() < this.until) return this.reason === null;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const state = await fetch();
        if (state.isActive === false) this.reason = null;
        else if (state.isActive === true) {
          const end = state.timeEnforcementEnds;
          this.reason = 'Envios suspensos por restrição do WhatsApp.' + (end ? ' Fim previsto: ' + end.toLocaleString('pt-PT',{timeZone:'Africa/Luanda'}) + ' (Angola).' : '');
        } else this.reason = 'Envios em espera: o WhatsApp não confirmou o estado da restrição.';
      } catch { this.reason = 'Envios em espera: não foi possível consultar as restrições do WhatsApp.'; }
      this.until = this.now() + 60000;
      return this.reason === null;
    })();
    try { return await this.pending; } finally { this.pending = null; }
  }
}
