import {useEffect,useRef,useState} from 'react';
import {MessageCircle,Send} from 'lucide-react';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

type Data={text:string;group:string|null;paused:boolean;message:{id:string;status:string;attempts:number;nextAttemptAt:string;sentAt:string|null}|null};
const time=(value:string)=>new Intl.DateTimeFormat('pt-PT',{timeZone:'Africa/Luanda',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
export default function RoundMessage({round,date,division,blocked}:{round:number;date:string;division:string;blocked:boolean}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[queued,setQueued]=useState(false);
 const requestId=useRef(crypto.randomUUID());
 const query=new URLSearchParams({round:String(round),date,division}).toString();
 useEffect(()=>{let active=true;const refresh=()=>api<Data>('/admin/round-message?'+query).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});void refresh();const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer);};},[query]);
 const row=data?.message,status=row?.status;
 const sent=['sent','delivered','read','accepted','provider_queued'].includes(status??'');
 const scheduled=status==='pending'&&!!row&&new Date(row.nextAttemptAt)>new Date();
 const labels:Record<string,string>={sent:'Enviada ao WhatsApp',delivered:'Entrega confirmada',read:'Leitura confirmada',accepted:'Aceite pelo WhatsApp',provider_queued:'Recebida pelo fornecedor · entrega por confirmar',sending:'A enviar…',uncertain:'Envio sem confirmação · verifica o grupo antes de repetir',failed:'Falha no envio',cancelled:'Envio cancelado',expired:'O envio expirou'};
 const description=!data?'A consultar envio…':data.paused?'Envios pausados':scheduled?'Agendada para '+time(row!.nextAttemptAt):status==='pending'?'Na fila para envio':status?labels[status]??status:'Sem registo associado. Se já recebeste a convocatória, este envio será um reforço.';
 const disabled=busy||blocked||!data?.group||data.paused||status==='sending'||status==='uncertain'||(status==='pending'&&!scheduled);
 async function send(){if(!data?.group)return;setBusy(true);setError('');try{
  await api('/admin/round-message/send','POST',{round,date,division,group:data.group,requestId:requestId.current,resend:sent});
  setQueued(true);setOpen(false);
  // A failed refresh must not turn a successful send into a second request.
  try{setData(await api<Data>('/admin/round-message?'+query));}catch{}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="rm-whatsapp" aria-label="Envio da convocatória">
  <div><strong><MessageCircle size={17}/>WhatsApp · {division}</strong><p role="status">{description}{sent&&row?.sentAt?' · '+time(row.sentAt):''}</p>{queued&&<p>Pedido guardado na fila. O estado acima atualiza automaticamente.</p>}</div>
  <Button disabled={disabled} onClick={()=>{if(queued){requestId.current=crypto.randomUUID();setQueued(false);}setError('');setOpen(true);}}><Send size={15}/>{sent?'Reenviar convocatória':'Enviar agora no WhatsApp'}</Button>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="rm-message-dialog"><DialogTitle>{sent?'Reenviar':'Enviar'} convocatória · {division}</DialogTitle><DialogDescription>Jogadores mencionados e link dos jogos. {scheduled?'Este envio antecipa a mensagem agendada, sem criar outra para mais tarde.':'A mensagem segue para o grupo associado ao torneio.'}</DialogDescription><div className="rm-message-text">{data?.text}</div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Voltar</Button><Button disabled={busy||blocked} onClick={send}>{busy?'A colocar na fila…':sent?'Reenviar agora':'Enviar agora'}</Button></div></DialogContent></Dialog>
 </section>;
}
