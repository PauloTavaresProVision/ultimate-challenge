import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerStandings} from '../../lib/player-standings.ts';
import type {Player,Game} from '../../lib/tournament.ts';
const players:Player[]=Array.from({length:5},(_,i)=>({id:String(i),name:`Player ${i}`,phone:'+244999999999',birth:`${1980+i}-01-01`,side:'Direita',division:i===4?'M1':'M2+',status:'Ativo',verified:true,note:'PRIVATE'}));
const game:Game={id:'g',round:1,division:'M2+',date:'2026-09-22',time:'20:00',court:'c',duration:20,a:['0','1'],b:['2','3'],winner:null,published:true};
test('Player sees own division with personal highlight and no private profile fields',()=>{
 const [current]=playerStandings('0',players,[game],'2026-09');
 assert.equal(current.division,'M2+');assert.equal(current.rows.length,4);
 assert.equal(current.rows.find(p=>p.isYou)?.id,'0');
 assert.ok(current.rows.every(p=>p.points===0));
 assert.ok(!JSON.stringify(current).includes('PRIVATE'));
 for(const p of current.rows){assert.ok(!('birth' in p));assert.ok(!('phone' in p));assert.ok(!('note' in p));}
});
test('Saved results update points, wins and losses while drafts and other months do not count',()=>{
 const [current]=playerStandings('0',players,[{...game,winner:'a'},{...game,id:'draft',published:false,winner:'b'},{...game,id:'old',date:'2026-08-22',winner:'b'}],'2026-09');
 const me=current.rows.find(p=>p.isYou)!;
 assert.equal(me.points,3);assert.equal(me.wins,1);assert.equal(me.losses,0);
 assert.equal(current.rows.find(p=>p.id==='2')?.points,1);
});
test('Historical table retains the player historical division and archived scores',()=>{
 const archive={month:'2026-08',table:[{id:'0',name:'Player 0',division:'M1',points:50,wins:10,losses:0,bonus:20}]};
 const months=playerStandings('0',players,[game],'2026-09',[archive]);
 assert.equal(months[0].division,'M2+');assert.equal(months[1].division,'M1');
 assert.equal(months[1].rows[0].points,50);assert.equal(months[1].archived,true);
});


test('All four divisions are available with independent positions and safe public fields',()=>{
 const [current,old]=playerStandings('0',players,[{...game,winner:'a'}],'2026-09',[{month:'2026-08',table:[
  {id:'4',name:'Other player',division:'M1',points:18,wins:6,losses:0,bonus:0},
  {id:'0',name:'Player 0',division:'M2+',points:3,wins:1,losses:0,bonus:0}
 ]}]);
 assert.deepEqual(current.divisions.map(d=>d.division),['M1+','M1','M2+','M2']);
 const other=current.divisions.find(d=>d.division==='M1')!;
 assert.equal(other.rows[0].position,1);assert.equal(other.rows[0].isYou,false);
 assert.equal(current.divisions.find(d=>d.division==='M2')!.rows.length,0);
 assert.equal(old.divisions.find(d=>d.division==='M1')!.rows[0].points,18);
 for(const month of [current,old])for(const division of month.divisions)for(const row of division.rows){
  assert.deepEqual(Object.keys(row).sort(),['id','name','position','points','wins','losses','bonus','isYou'].sort());
 }
});
