import {useEffect,useRef,useState} from 'react';
import {Search,X,Clock} from 'lucide-react';
import {allMessageEmojis,emojiCategories,normalizeEmojiSearch} from '@/lib/message-emojis';
export default function MessageEmojiPicker({onSelect,onClose,disabled}:{onSelect:(emoji:string)=>void;onClose:()=>void;disabled:boolean}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState('faces'),[recent,setRecent]=useState<string[]>([]);
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('wa-recent-emojis')??'[]');if(Array.isArray(saved))setRecent(saved.filter(e=>allMessageEmojis.some(x=>x.emoji===e)).slice(0,24));}catch{}},[]);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!(e.target as Element).closest('[aria-controls="message-emoji-picker"]'))onClose();};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[onClose]);
 const items=query?allMessageEmojis.filter(e=>normalizeEmojiSearch(e.label+' '+e.emoji).includes(normalizeEmojiSearch(query))):category==='recent'?recent.map(emoji=>allMessageEmojis.find(e=>e.emoji===emoji)!):emojiCategories.find(c=>c.id===category)!.items;
 return <div id="message-emoji-picker" ref={panel} className="gc-emoji-picker" role="dialog" aria-label="Escolher emoji" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
 <header><strong>Escolhe um emoji</strong><button type="button" onClick={onClose} aria-label="Fechar emojis"><X size={17}/></button></header>
 <label className="gc-emoji-search"><Search size={17}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar: padel, cerveja, sorriso…" aria-label="Pesquisar emojis"/></label>
 <nav aria-label="Categorias de emojis"><button type="button" aria-pressed={category==='recent'&&!query} onClick={()=>{setCategory('recent');setQuery('');}} title="Recentes" aria-label="Recentes"><Clock size={18}/></button>{emojiCategories.map(c=><button type="button" key={c.id} title={c.name} aria-label={c.name} aria-pressed={category===c.id&&!query} onClick={()=>{setCategory(c.id);setQuery('');}}>{c.icon}</button>)}</nav>
 <div className="gc-emoji-label">{query?'Resultados':category==='recent'?'Usados recentemente':emojiCategories.find(c=>c.id===category)?.name}<span>{items.length}</span></div>
 <div className="gc-emoji-grid">{items.map(({emoji,label})=><button type="button" key={emoji} disabled={disabled} title={label} aria-label={label} onClick={()=>{onSelect(emoji);const next=[emoji,...recent.filter(e=>e!==emoji)].slice(0,24);setRecent(next);try{localStorage.setItem('wa-recent-emojis',JSON.stringify(next));}catch{}}}>{emoji}</button>)}</div>
 {!items.length&&<p className="gc-emoji-empty">{query?'Nenhum emoji encontrado. Experimenta outra palavra.':'Os emojis que escolheres ficam aqui.'}</p>}
 <footer>{allMessageEmojis.length} emojis · pesquisa em português</footer>
 </div>;
}
