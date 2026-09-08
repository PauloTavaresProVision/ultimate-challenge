import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {api} from './whatsapp-live';
import type {PublicRules} from '../lib/public-rules';
export default function RulesEditor(){
 const [data,setData]=useState<{version:number;rules:PublicRules}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 useEffect(()=>{api('/rules').then(setData).catch(e=>setError(e.message));},[]);
 const update=(rules:PublicRules)=>{if(data)setData({...data,rules});setNote('');};
 return <section className="panel"><div className="section-heading"><div><h2>Regras públicas</h2><p>Edita o conteúdo que os jogadores consultam no link enviado pelo bot.</p></div><a href="/regras" target="_blank" rel="noreferrer">Ver página pública ↗</a></div><p>Estas alterações modificam o texto publicado. A pontuação e os sorteios continuam a usar as regras de funcionamento da plataforma.</p>{error&&<p className="form-error" role="alert">{error}</p>}{note&&<p role="status">{note}</p>}
 {data&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNote('');try{setData(await api('/admin/rules','PUT',data));setNote('Regras guardadas e publicadas.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><fieldset disabled={busy} style={{border:0,padding:0}}><label className="field">Título<Input required maxLength={150} value={data.rules.title} onChange={e=>update({...data.rules,title:e.target.value})}/></label><label className="field">Introdução<Textarea maxLength={500} value={data.rules.intro} onChange={e=>update({...data.rules,intro:e.target.value})}/></label>
 {data.rules.sections.map((section,i)=><div className="substitution-vacancy" key={i}><label className="field">Título da secção {i+1}<Input required maxLength={150} value={section.title} onChange={e=>update({...data.rules,sections:data.rules.sections.map((s,n)=>n===i?{...s,title:e.target.value}:s)})}/></label><label className="field">Conteúdo<Textarea required rows={6} maxLength={8000} value={section.text} onChange={e=>update({...data.rules,sections:data.rules.sections.map((s,n)=>n===i?{...s,text:e.target.value}:s)})}/></label><Button type="button" variant="ghost" disabled={data.rules.sections.length===1} onClick={()=>update({...data.rules,sections:data.rules.sections.filter((_,n)=>n!==i)})}>Remover secção</Button></div>)}
 <div className="dialog-actions"><Button type="button" variant="outline" disabled={data.rules.sections.length>=30} onClick={()=>update({...data.rules,sections:[...data.rules.sections,{title:'',text:''}]})}>Adicionar secção</Button><Button type="submit">{busy?'A guardar…':'Guardar e publicar regras'}</Button></div></fieldset></form>}
 </section>;
}
