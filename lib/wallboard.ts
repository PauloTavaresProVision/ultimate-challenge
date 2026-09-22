export type WallGame={id:string;division:string;time:string;duration:number;court:string;location:string;a:string[];b:string[];winner:'a'|'b'|null};
export type WallData={date:string;dates:string[];games:WallGame[];serverTime:string};
export function wallSlot(times:string[],date:string,now:Date){
  if(!times.length)return '';
  return [...times].reverse().find(time=>Date.parse(`${date}T${time}:00+01:00`)<=now.getTime())??times[0];
}
export function wallName(name:string){
  if(name.length<=25)return name;
  const words=name.trim().split(/\s+/);
  if(words.length<=2)return name;
  return [words[0],...words.slice(1,-1).map(w=>/^(de|da|do|dos|das|e)$/i.test(w)?w:w[0]+'.'),words[words.length-1]].join(' ');
}
