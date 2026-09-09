import {useEffect,useState,useRef} from 'react';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
import {Input} from './ui/input';

type Item={id:string;phone:string;name:string|null;delivery:string;registration:string;createdAt:string;canResend:boolean};
const registrations:Record<string,string>={pending:'A aguardar',expired:'Expirado',verification:'Por validar',registered:'Por aprovar',approved:'Inscrito',rejected:'Rejeitado',inactive:'Inativo'};
const deliveries:Record<string,string>={pending:'Em fila',sending:'A enviar',sent:'Enviado*',accepted:'Enviado*',delivered:'Entregue',read:'Lido',failed:'Falhou',uncertain:'Por confirmar',cancelled:'Cancelado',expired:'Expirado'};

export default function InviteHistory({connected}:{connected:boolean}){
  const [data,setData]=useState<{items:Item[];total:number}>({items:[],total:0});
  const [offset,setOffset]=useState(0),[search,setSearch]=useState(''),[filter,setFilter]=useState('all');
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[note,setNote]=useState(''),[loading,setLoading]=useState(true);
  const requests=useRef(new Map<string,string>());
  const url='/admin/invite-history?offset='+offset+'&search='+encodeURIComponent(search)+'&filter='+filter;
  useEffect(()=>{
    let active=true;setLoading(true);
    const load=()=>api<typeof data>(url).then(d=>{if(active){setData(d);setError('');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    void load();const timer=setInterval(load,10000);
    return()=>{active=false;clearInterval(timer);};
  },[url]);
  async function resend(item:Item){
    setBusy(item.id);setError('');setNote('');
    const batchId=requests.current.get(item.id)??crypto.randomUUID();requests.current.set(item.id,batchId);
    try{
      await api('/admin/invite-deliveries','POST',{batchId,phones:[item.phone],message:'Olá! Reenviamos o teu convite para o Ultimate Challenge, no Premier Padel Club. Preenche a inscrição através deste link:'});
      requests.current.delete(item.id);setNote('Convite para '+item.phone+' colocado na fila.');
      setData(await api<typeof data>(url));
    }catch(e){setError((e as Error).message);}finally{setBusy('');}
  }
  return <section className="invite-list" aria-labelledby="invite-list-title">
    <header className="invite-list-header"><h2 id="invite-list-title">Convites enviados <span>{data.total}</span></h2>
      <div className="invite-list-tools">
        <Input aria-label="Pesquisar contacto pelo número" placeholder="Pesquisar número…" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/>
        <select aria-label="Filtrar inscrições" value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0);}}><option value="all">Todos</option><option value="pending">Aguardam inscrição</option><option value="registered">Com inscrição</option></select>
      </div>
    </header>
    <p className="invite-list-note">Os convites e reenvios saem um de cada vez, com pelo menos 30 segundos de intervalo. A fila pausa se o WhatsApp não puder enviar.</p>
    <div className="invite-list-scroll" tabIndex={0} role="region" aria-label="Lista de contactos convidados">
      <table className="invite-list-table"><thead><tr><th>Contacto</th><th>Envio</th><th>Inscrição</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{!loading&&data.items.map(item=><tr key={item.phone}>
          <td title={item.name??item.phone}>{item.phone}</td>
          <td><span className="invite-state" data-state={item.delivery} title={'Último envio: '+new Date(item.createdAt).toLocaleString('pt-PT',{timeZone:'Africa/Luanda'})}>{deliveries[item.delivery]??item.delivery}</span></td>
          <td><span className="invite-state" data-state={item.registration}>{registrations[item.registration]??item.registration}</span></td>
          <td>{item.delivery==="pending"?<Button size="sm" variant="ghost" disabled={!!busy} onClick={async()=>{setBusy(item.id);setError("");try{await api("/admin/invite-deliveries/"+item.id+"/cancel","POST");setData(await api<typeof data>(url));setNote("Convite cancelado.");}catch(e){setError((e as Error).message);}finally{setBusy("");}}}>Cancelar</Button>:<Button size="sm" variant="ghost" disabled={!connected||!!busy||!item.canResend} title={!item.canResend?'Já inscrito ou convite em fila':!connected?'Liga o WhatsApp para reenviar':'Enviar novo convite'} onClick={()=>void resend(item)}>{busy===item.id?'A enviar…':'Reenviar'}</Button>}</td>
        </tr>)}{(loading||!data.items.length)&&<tr><td colSpan={4} className="invite-list-empty">{loading?'A carregar contactos…':search||filter!=='all'?'Nenhum contacto encontrado.':'Ainda não enviaste convites.'}</td></tr>}</tbody>
      </table>
    </div>
    {data.items.some(i=>['sent','accepted'].includes(i.delivery))&&<p className="invite-list-note">* Entrega ainda não confirmada pelo WhatsApp.</p>}
    {data.total>50&&<footer className="invite-list-pages"><span>{offset+1}–{Math.min(offset+50,data.total)} de {data.total}</span><Button variant="ghost" disabled={!offset} onClick={()=>setOffset(offset-50)}>Anterior</Button><Button variant="ghost" disabled={offset+50>=data.total} onClick={()=>setOffset(offset+50)}>Seguinte</Button></footer>}
    {error&&<p role="alert" className="form-error">{error}</p>}{note&&<p role="status" className="invite-list-note">{note}</p>}
  </section>;
}
