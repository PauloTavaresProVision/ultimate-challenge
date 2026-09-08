export type Delivery = { mode: 'immediate' | 'scheduled'; hoursBefore: number };
export function deliveryWindow(setting: Delivery, games: {date:string;time:string}[], now=new Date()) {
  if(setting.mode==='immediate') return {nextAttemptAt:now,expiresAt:new Date(now.getTime()+86400000)};
  const start=Math.min(...games.map(g=>Date.parse(`${g.date}T${g.time}:00+01:00`)));
  if(!Number.isFinite(start)||start<=now.getTime()) throw Object.assign(new Error('Para agendar o envio, os jogos têm de começar no futuro.'),{status:400});
  return {nextAttemptAt:new Date(Math.max(now.getTime(),start-setting.hoursBefore*3600000)),expiresAt:new Date(start)};
}
