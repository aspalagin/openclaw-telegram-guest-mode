// Synthetic fixtures only. Every transport is mocked; no credentials or network access.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const R=path.dirname(new URL(import.meta.url).pathname);
const D=process.argv[2];
if (!D) throw new Error('Pass the dist directory of a disposable, patched OpenClaw 2026.10.9 package');
const baseline=process.argv.includes('--baseline');
const source=n=>fs.readFileSync(D+'/'+n,'utf8');
let pass=0,fail=0, networkCalls=0;
async function test(name,fn){try{await fn();pass++;console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+': '+e.stack);}}
const S='agent:test:telegram:direct:1:guest:1-at-2';
function registry(){
 const calls=[],timers=new Set();let failEdit=false;
 const box={console, Buffer, FormData, Blob, Date, Map, Set, Object, String, Number, Array, Promise, process:{env:{OPENCLAW_HOTFIX_GUEST_ACK_FILE:'/synthetic-rules'}}, fs:{statSync(){return {mtimeMs:1,size:2};},readFileSync(){return JSON.stringify({mediaStagingChatId:'1'});}},
 setTimeout(fn){const t={fn,unref(){}};timers.add(t);return t;},clearTimeout(t){timers.delete(t);},
 fetch(){networkCalls++;throw Error('NETWORK FORBIDDEN');},logVerbose(){},formatErrorMessage:e=>e.message??String(e),
 hotfixTelegramApiRoot:bot=>bot?.clientConfig?.apiRoot ?? "https://api.example.test", normalizeTelegramGuestPlainText:s=>s, truncateTelegramGuestText:s=>String(s??'').slice(0,4096), TELEGRAM_GUEST_TEXT_LIMIT:4096,
 planTelegramTextDeliveryPages:({text})=>[{plainText:text,richMessage:{blocks:[{type:'paragraph',text}]}}],buildTelegramGuestTextResult:text=>({text}),
 async answerTelegramGuestQuery(bot,id){calls.push({answer:id});return {inline_message_id:'inline-'+id};},
 async loadWebMedia(file,options){assert.deepEqual(Array.from(options.localRoots),['/fixture']);if(!file.startsWith('/fixture/'))throw Error('outside allowed roots');return {buffer:Buffer.from('synthetic harmless file'),contentType:'text/plain',fileName:'sample.txt'};}
 };
 vm.createContext(box);
 const s=source('delivery-B2vxfnEv.mjs');const a=s.indexOf('//#region hotfix: guest-ack-edit (registry)');const b=s.indexOf('function createReplyDeliverer(',a);
 vm.runInContext(s.slice(a,b)+'\nglobalThis.markAnswered=hotfixGuestAckMarkAnswered; globalThis.placeholder=hotfixGuestAckSendPlaceholder;',box);
 const r=box.__openclawHotfixGuestAck;
 const bot={api:{raw:{async editMessageText(body){calls.push({edit:body});if(failEdit)throw Error('synthetic edit denied');return true;},async editMessageMedia(body){calls.push({media:body});if(failEdit)throw Error('synthetic edit denied');return true;}}}};
 r.__uploadTransport=async (url,opts)=>{calls.push({upload:url.split('/').at(-1),chat:opts.body.get('chat_id'),bytes:(await opts.body.get('document')?.text())});return {ok:true,json:async()=>({ok:true,result:{message_id:17,chat:{id:1},document:{file_id:'FILE_ID',file_name:'sample.txt',file_size:24}}})};};
 const arm=id=>r.arm({guestQueryId:id,sessionKey:S,bot,token:'synthetic-not-a-credential',richMessages:true,mediaLocalRoots:['/fixture']});
 const answered=(h)=>box.markAnswered(h.entry,'inline-'+h.entry.guestQueryId,'ack','ack',{richMessages:true});
 return {box,r,arm,answered,calls,timers,setFailEdit:v=>failEdit=v};
}
export {registry,S,source,networkCalls};
