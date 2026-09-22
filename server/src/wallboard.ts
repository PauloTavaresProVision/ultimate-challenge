import type {Express} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
import {todayLuanda,vacancies} from './substitutions.ts';
export function installWallboard(app:Express){
  app.get('/api/wallboard',async(req,res)=>{
    const today=todayLuanda();
    const date=z.iso.date().parse(req.query.date??today);
    const [games,people,dates,absences]=await Promise.all([
      db.game.findMany({where:{published:true,date},select:{id:true,division:true,time:true,duration:true,a:true,b:true,winner:true,court:{select:{name:true,location:true}}},orderBy:[{time:'asc'},{division:'asc'},{courtId:'asc'}]}),
      db.player.findMany({select:{id:true,name:true}}),
      db.game.findMany({where:{published:true,date:{gte:today}},distinct:['date'],select:{date:true},orderBy:{date:'asc'},take:60}),
      vacancies(),
    ]);
    const names=new Map(people.map(p=>[p.id,p.name]));
    const name=(id:string,gameId:string)=>absences.some(v=>v.status==='pending'&&v.playerId===id&&v.gameIds.includes(gameId))?'Aguarda suplente':names.get(id)??'Jogador indisponível';
    res.set('Cache-Control','no-store').json({date,serverTime:new Date().toISOString(),dates:[...new Set([today,date,...dates.map(d=>d.date)])].sort(),games:games.map(g=>({id:g.id,division:g.division,time:g.time,duration:g.duration,court:g.court.name,location:g.court.location,a:g.a.map(id=>name(id,g.id)),b:g.b.map(id=>name(id,g.id)),winner:g.winner}))});
  });
}
