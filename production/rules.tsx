import {useEffect,useState} from 'react';
import type {PublicRules} from '../lib/public-rules';
export default function RulesPage(){
const [rules,setRules]=useState<PublicRules|null>(null),[error,setError]=useState(false);
useEffect(()=>{fetch('/api/rules',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json() as Promise<{rules:PublicRules}>;}).then(d=>setRules(d.rules)).catch(()=>setError(true));},[]);
if(!rules)return <main className="rules-page" style={{padding:40}}><h1>Regras do Ultimate Challenge</h1><p>{error?'Não foi possível carregar as regras. Tenta atualizar a página.':'A carregar regras…'}</p></main>;
 return <main className="rules-page"><header><div className="ultimate-logo"><img src="/ultimate-challenge.png" alt="Ultimate Challenge"/></div><span>PREMIER PADEL CLUB</span></header><section className="rules-intro"><p>ULTIMATE CHALLENGE</p><h1>{rules.title}</h1><p>{rules.intro}</p></section><div className="rules-content">{rules.sections.map(({title,text},i)=><section key={i}><span className="rules-number">{String(i+1).padStart(2,'0')}</span><div><h2>{title}</h2><p style={{whiteSpace:"pre-wrap"}}>{text}</p></div></section>)}</div><footer><a href="/jogos">Consultar os jogos →</a><p>Ultimate Challenge · Premier Padel Club</p></footer></main>;
}
