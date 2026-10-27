import {db} from './src/db.ts';
import {mergeM2} from './src/merge-m2.ts';
try {console.log(JSON.stringify(await mergeM2(process.argv.includes('--apply')),null,2));}
catch(e){console.error('SEM ALTERAÇÕES:',e.message);process.exitCode=1;}
finally{await db.$disconnect();}
