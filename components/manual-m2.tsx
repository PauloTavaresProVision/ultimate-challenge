import {useEffect,useState} from 'react';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './ui/dialog';
type Candidate={id:string;name:string;position:number;points:number;blocked:boolean};
type Plan={month:string;revision:number;changes:{id:string}[];candidates:Candidate[];blocked:string|null};
export function useManualM2(enabled:boolean){
 const [plan,setPlan]=useState<Plan|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[confirm,setConfirm]=useState(false);
 async function load(){setBusy(true);setError('');setPlan(null);setConfirm(false);try{const next=await api<Plan>('/admin/competition/manual-m2');setPlan(next);setSelected(next.changes.map(p=>p.id));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{if(enabled&&!done)void load();},[enabled,done]);
 const chosen=plan?.candidates.filter(p=>selected.includes(p.id))??[];
 const blocked=plan?.blocked||(chosen.some(p=>p.blocked)?'Há jogadores selecionados com jogos por realizar. Revê os sorteios ou altera a seleção.':null);
 const toggle=(id:string)=>{setConfirm(false);setSelected(ids=>ids.includes(id)?ids.filter(p=>p!==id):[...ids,id]);};
 async function apply(){if(!plan)return;setBusy(true);setError('');try{await api('/admin/competition/manual-m2','POST',{revision:plan.revision,ids:selected});setDone(true);setConfirm(false);setPlan(null);setSelected([]);window.dispatchEvent(new Event('tournament-updated'));}catch(e){setError((e as Error).message);setPlan(null);setConfirm(false);}finally{setBusy(false);}}
 return {plan,selected,busy,error,done,confirm,setConfirm,load,chosen,blocked,toggle,apply,reset:()=>setSelected(plan?.changes.map(p=>p.id)??[]),clear:()=>setSelected([])};
}
export function ManualM2Controls({state}:{state:ReturnType<typeof useManualM2>}){
 const s=state;
 return <>
 <div className="ranking-descent-controls">
  <div><h3>Escolher quem desce para M2</h3><p>{s.done?'Descida concluída. Os 20 jogadores passaram para M2.':s.plan?`Sugestão: 20 últimos da classificação do ciclo (${s.plan.month}), independentemente do lado. Marca ou desmarca jogadores na tabela.`:s.error?'Não foi possível preparar a seleção.': 'A carregar a seleção para este ciclo…'}</p></div>
  {s.error&&<p className="form-error" role="alert">{s.error}</p>}
  {!s.done&&<div className="ranking-descent-actions"><strong role="status">{s.selected.length} / 20 selecionados</strong><Button variant="outline" disabled={s.busy} onClick={()=>void s.load()}>Atualizar seleção</Button>{s.plan&&<><Button variant="ghost" disabled={s.busy} onClick={s.reset}>Usar os 20 sugeridos</Button><Button variant="ghost" disabled={s.busy} onClick={s.clear}>Limpar</Button><Button disabled={s.busy||s.selected.length!==20||!!s.blocked} onClick={()=>s.setConfirm(true)}>Rever descida de 20 jogadores</Button></>}</div>}
  {s.blocked&&<p className="form-error" role="status">{s.blocked}</p>}
  {s.plan&&<p className="competition-note">A tabela mantém o ranking acumulado. “Sugerido” refere-se à posição no ciclo, indicada junto ao nome. A decisão final é tua. Pesquisar não apaga a seleção.</p>}
 </div>
 <Dialog open={s.confirm} onOpenChange={value=>{if(!s.busy)s.setConfirm(value);}}><DialogContent showCloseButton={!s.busy} className="ranking-descent-dialog"><DialogHeader><DialogTitle>Confirmar 20 descidas · M2+ → M2</DialogTitle><DialogDescription>Vão descer apenas os jogadores abaixo. Os pontos mantêm-se. Esta exceção só pode ser aplicada uma vez. Não será enviada mensagem ao WhatsApp.</DialogDescription></DialogHeader><ol className="ranking-descent-names">{s.chosen.map(p=><li key={p.id}>{p.name}</li>)}</ol><DialogFooter><Button variant="outline" disabled={s.busy} onClick={()=>s.setConfirm(false)}>Voltar à seleção</Button><Button disabled={s.busy||s.selected.length!==20} onClick={()=>void s.apply()}>{s.busy?'A aplicar…':'Confirmar descida dos 20 selecionados'}</Button></DialogFooter></DialogContent></Dialog>
 </>;
}
