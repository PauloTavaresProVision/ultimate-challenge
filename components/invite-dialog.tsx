import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { api } from './whatsapp-live';
const countries=[['ao','Angola','244'],['pt','Portugal','351'],['br','Brasil','55'],['mx','México','52'],['ae','Emirados Árabes Unidos / Dubai','971'],['mz','Moçambique','258'],['cv','Cabo Verde','238'],['za','África do Sul','27'],['es','Espanha','34'],['fr','França','33'],['gb','Reino Unido','44'],['us','Estados Unidos','1']];
const labels:Record<string,string>={read:'Lido',delivered:'Entregue ao destinatário',accepted:'Aceite pelo servidor WhatsApp — aguarda entrega',pending:'Pendente',sending:'A enviar',sent:'Enviado ao WhatsApp — entrega não confirmada',uncertain:'Sem confirmação — verifica no WhatsApp',expired:'Expirado',cancelled:'Cancelado',failed:'Falhou'};
type Row={id:string;phone:string;status:string};
export default function InviteDialog({connected}:{connected:boolean}){
 const [open,setOpen]=useState(false),[country,setCountry]=useState('244'),[numbers,setNumbers]=useState(''),[message,setMessage]=useState('Olá! Estás convidado a participar no Ultimate Challenge, no Premier Padel Club. Preenche a tua inscrição através deste link:'),[batch,setBatch]=useState(''),[rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const entries=numbers.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean);
 const normalized=entries.map(s=>{const clean=s.replace(/[\s().-]/g,'');return clean.startsWith('+')?clean:clean.startsWith('00')?'+'+clean.slice(2):'+'+country+clean;});
 const phones=[...new Set(normalized)];const invalid=phones.filter(p=>!/^\+[1-9]\d{7,14}$/.test(p));
 useEffect(()=>{if(!open||!batch||!rows.length)return;let active=true;const refresh=()=>api<Row[]>('/admin/invite-deliveries/'+batch).then(r=>{if(active)setRows(r);}).catch(e=>{if(active)setError(e.message);});void refresh();const timer=setInterval(refresh,3000);return()=>{active=false;clearInterval(timer);};},[open,batch,rows.length]);
 return <><Button variant="outline" onClick={()=>setOpen(true)}><Send size={16}/>Enviar convites</Button><Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="invite-dialog"><DialogHeader><DialogTitle>Convidar jogadores</DialogTitle><DialogDescription>Cada número recebe uma mensagem privada com um link individual de inscrição.</DialogDescription></DialogHeader>
 {!rows.length ? <form onSubmit={async e=>{e.preventDefault();if(busy||invalid.length||!phones.length||phones.length>50)return;setBusy(true);setError('');const id=batch||crypto.randomUUID();setBatch(id);try{const result=await api<{recipients:Row[]}>('/admin/invite-deliveries','POST',{batchId:id,phones,message});setRows(result.recipients.map(r=>({...r,status:'pending'})));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy||!!batch} style={{border:0,padding:0,margin:0}}><label className="field">Indicativo para números locais<div className="invite-country"><img src={'/flags/'+countries.find(c=>c[2]===country)?.[0]+'.png'} width={24} height={16} alt=""/><select value={country} onChange={e=>setCountry(e.target.value)}>{countries.map(([id,name,dial])=><option key={id} value={dial}>{name} (+{dial})</option>)}</select></div></label>
 <label className="field">Números WhatsApp<Textarea value={numbers} onChange={e=>setNumbers(e.target.value)} rows={4} placeholder={'923456789\n+351912345678'} required maxLength={2000}/></label><p className="wa-footnote">Um número por linha, ou separados por vírgulas. Para outros países, inclui + e o indicativo. Máximo: 50.</p>
 <label className="field">Mensagem<Textarea value={message} onChange={e=>setMessage(e.target.value)} rows={3} required maxLength={1500}/></label></fieldset>
 <div className="invite-preview"><strong>Pré-visualização</strong><p>{message}</p><span>[Link individual de inscrição]</span><p>Convite individual, válido por 7 dias. A inscrição depende da aprovação da organização.</p></div>
 <p>{phones.length} destinatário(s){entries.length>phones.length ? ' · números repetidos removidos' : ''}</p>
 {!!invalid.length&&<p role="alert" className="form-error">Revê os números: {invalid.join(', ')}</p>}{phones.length>50&&<p className="form-error">Envia no máximo 50 convites de cada vez.</p>}
 {!connected&&<p className="form-error">Liga o WhatsApp antes de enviar.</p>}{error&&<p role="alert" className="form-error">{error}</p>}
 <div className="dialog-actions"><Button type="submit" disabled={busy||!connected||!phones.length||!!invalid.length||phones.length>50||!message.trim()}><Send size={16}/>{busy?'A preparar…':batch?'Verificar / repetir pedido':'Enviar '+phones.length+' convite(s)'}</Button></div>
 </form> : <><p role="status">Convites preparados. Acompanha o envio abaixo.</p><ul className="invite-status">{rows.map(r=><li key={r.id}><strong>{r.phone}</strong><span>{labels[r.status]??r.status}</span></li>)}</ul>{error&&<p role="alert" className="form-error">{error}</p>}<Button variant="outline" onClick={()=>{setRows([]);setBatch('');setNumbers('');setError('');}}>Novo envio</Button></>}
 </DialogContent></Dialog></>;
}
