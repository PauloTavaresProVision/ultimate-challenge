import type {Player} from './tournament.ts';
// Tournament restriction requested by the organiser. Exact full names only.
const normalized=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-PT');
export function forbiddenPartnership(a:Pick<Player,'name'|'division'>,b:Pick<Player,'name'|'division'>){
 if(a.division!=='M1+'||b.division!=='M1+')return false;
 const names=[normalized(a.name),normalized(b.name)];
 return names.includes('sergio vieira')&&names.includes('ivo guilherme rego');
}
