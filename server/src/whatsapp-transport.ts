export type WhatsAppEngine='baileys'|'webjs';
export type GroupInfo={id:string;subject:string;participants:Array<{id:string;phoneNumber?:string}>};
export interface MessagingSocket {
  user?: {id:string;name?:string};
  sendMessage(jid:string,content:{text:string;mentions?:string[]}):Promise<{key:{id?:string|null}}|undefined>;
  groupMetadata(jid:string):Promise<GroupInfo>;
  groupFetchAllParticipating():Promise<Record<string,GroupInfo>>;
  groupInviteCode(jid:string):Promise<string|undefined>;
  groupParticipantsUpdate(jid:string,participants:string[],action:'add'):Promise<Array<{status:string}>>;
  signalRepository:{lidMapping:{getLIDForPN(jid:string):Promise<string|null|undefined>;getPNForLID(jid:string):Promise<string|null|undefined>}};
  end(error?:Error):void|Promise<void>;
}
