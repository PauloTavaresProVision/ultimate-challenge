// Never log raw Boom.data: it can include identifiers or protocol payloads.
export function closeDiagnostic(error:unknown, phase:string, openedAt:number) {
  const e=error as {output?:{statusCode?:number};data?:{tag?:string;attrs?:{type?:string;reason?:string};reason?:string}}|undefined;
  const known=new Set(['device_removed','replaced','conflict','logged_out','connection_closed','restart_required','timed_out']);
  const candidates=[e?.data?.attrs?.type,e?.data?.attrs?.reason,e?.data?.reason,e?.data?.tag];
  return {code:e?.output?.statusCode??null,reason:candidates.find(v=>v&&known.has(v))??'not_provided',
    phase,socketAgeSeconds:Math.max(0,Math.floor((Date.now()-openedAt)/1000)),processUptimeSeconds:Math.floor(process.uptime())};
}
