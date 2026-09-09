// Stop waiting on HTTP without cancelling or repeating the original send.
export async function testSendResponse<T>(send:Promise<T>,timeoutMs=15000):Promise<T|{pending:true}>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([send,new Promise<{pending:true}>(resolve=>{
    timer=setTimeout(()=>resolve({pending:true}),timeoutMs);
  })]);}finally{if(timer)clearTimeout(timer);}
}
