"use client";
import {useEffect,useRef,useState} from "react";
import {PageShell} from "./ui/page-shell";
import {kvGet,kvSet,registerDynamicPrefix,hydrateKvDb} from "@/lib/kv-db";
import {loadCharacters,saveCharacters,createCharacter} from "@/lib/character-storage";
import {addChatContact,createOrGetSession,pushChatMessage,hydrateChatStorage,loadChatSessions,loadChatMessages,loadChatContacts} from "@/lib/chat-storage";
import {loadApiConfigs,loadBindingConfig,loadWorldBooks,resolveUserIdentity} from "@/lib/settings-storage";
import {buildProviderRequest,parseProviderResponse,type LlmRequestMessage} from "@/lib/llm-provider-adapter";
import {localApiFetch,isLoopbackApiUrl} from "@/lib/local-api-fetch";
import {determineBaseUrl} from "@/lib/api-helpers";
import {loadMemoryEntries} from "@/lib/memory-storage";
import {fetchLlmPayload} from "@/lib/llm-http";
registerDynamicPrefix("ai_phone_square_forum_v1:");
type Config={id?:string;baseUrl?:string;apiKey?:string;model?:string;temperature?:number};
type Post={authorName?:string;title?:string;content?:string};
type ForumWindow=Window & {forumBack?:()=>boolean};
export function SquareForumApp({onClose,onOpenSession}:{onClose:()=>void;onOpenSession:(id:string)=>void}){
 const [ready,setReady]=useState(false),frame=useRef<HTMLIFrameElement>(null),callbacks=useRef({onClose,onOpenSession});callbacks.current={onClose,onOpenSession};
 const back=()=>{if(!(frame.current?.contentWindow as ForumWindow)?.forumBack?.())callbacks.current.onClose();};
 useEffect(()=>{
 let active=true;
 const memories=new Map<string,string>();
 const config=()=>{const a=loadApiConfigs();return a.find(a=>a.id===loadBindingConfig().globalDefaults.apiConfigId)||a[0];};
 const profile=(a:ReturnType<typeof config>)=>({id:a?.id,name:a?.name,baseUrl:a?determineBaseUrl(a):undefined,apiKey:a?.apiKey,model:a?.defaultModel,temperature:0.9});
 const forumFetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input);if(isLoopbackApiUrl(url))return localApiFetch(url,init);
 return fetch("/api/tool-proxy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,method:init?.method||"GET",headers:Object.fromEntries(new Headers(init?.headers).entries()),body:init?.body??null,timeoutMs:120000}),signal:init?.signal});
 };
 const host={
 snapshot(){const p=resolveUserIdentity();return{identity:{id:p?.id||"default",displayName:p?.name||"我",avatar:p?.avatarUrl||"",persona:p?.bio||""},characters:loadCharacters().map(c=>({...c,displayName:c.name,summary:c.persona})),worldBooks:loadWorldBooks().map(b=>({...b,title:b.name,entries:b.entries.map(e=>({...e,title:e.comment||e.key,keywords:e.key,enabled:!e.disable}))})),api:profile(config()),profiles:loadApiConfigs().map(profile)};},
 read(k:string){try{return JSON.parse(kvGet("ai_phone_square_forum_v1:"+k)||"null");}catch{return null;}},
 write(k:string,v:unknown){if(active)kvSet("ai_phone_square_forum_v1:"+k,JSON.stringify(v));},
 close(){callbacks.current.onClose();},
 fetch:forumFetch,
 async imageData(url:string){const res=await forumFetch(url,{credentials:"omit"});if(!res.ok)throw Error("图片下载失败");if(res.headers.get("Content-Type")?.includes("application/json")){const data=await res.json();if(data._binary&&data.data&&String(data.contentType).startsWith("image/")){if(data.data.length>20*1024*1024)throw Error("图片过大");return "data:"+data.contentType+";base64,"+data.data;}throw Error("图片下载失败");}const blob=await res.blob();if(blob.size>15*1024*1024)throw Error("图片过大");return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});},
 threads(id:string){return loadChatSessions().filter(s=>loadChatContacts().some(c=>c.id===s.contactId&&c.characterId===id)).map(s=>({...s,charId:id}));},
 memory(id?:string){return id?memories.get(id)||"":"";},
 recent(args:unknown[]){const arg=args.find(a=>a&&typeof a==="object") as {id?:string;characterId?:string;charId?:string}|undefined;const session=loadChatSessions().find(s=>s.id===arg?.id||loadChatContacts().some(c=>c.id===s.contactId&&c.characterId===(arg?.characterId||arg?.charId)));return session?loadChatMessages(session.id,20).map(m=>m.role+": "+m.content).join("\n"):"";},
 async complete(body:{messages:LlmRequestMessage[];max_tokens?:number;temperature?:number},input?:Config){
 const known=loadApiConfigs().find(a=>a.id===input?.id),base=known||config();if(!base&&!input?.apiKey)throw Error("请先配置论坛或小手机 API");
 const selected={...(base||{id:"forum-custom",provider:"custom",enableImageRecognition:false,enableImageGeneration:false}),...(!known&&input?.baseUrl?{provider:"custom"}:{}),apiKey:input?.apiKey||base?.apiKey||"",baseUrl:input?.baseUrl||base?.baseUrl,defaultModel:input?.model||base?.defaultModel||""};
 const request=buildProviderRequest(selected,null,body.messages,{stream:false,maxTokens:body.max_tokens});const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{const response=isLoopbackApiUrl(request.url)?await fetchLlmPayload(request,{signal:controller.signal}):await forumFetch(request.url,{method:"POST",headers:request.headers,body:JSON.stringify(request.body),signal:controller.signal});if(!response.ok)throw Error("论坛 AI 请求失败（"+response.status+"），请检查配置");const parsed=parseProviderResponse(request.providerKind,await response.json());if(!parsed.content)throw Error("模型没有返回论坛内容");return{choices:[{message:{content:parsed.content}}]};}finally{clearTimeout(timer);}
 },
 async addFriend(data:{name:string;summary?:string;identity?:string}){await hydrateChatStorage();const chars=loadCharacters();let c=chars.find(c=>c.name===data.name);if(!c){c=createCharacter({name:data.name,avatar:null,persona:[data.summary,data.identity].filter(Boolean).join("\n"),tags:["论坛好友"]});saveCharacters([...chars,c]);}addChatContact(c.id);return{...c,displayName:c.name};},
 openFriend(id:string){addChatContact(id);callbacks.current.onOpenSession(createOrGetSession(loadChatContacts().find(c=>c.characterId===id)!.id).id);},
 async share(id:string,post:Post){await hydrateChatStorage();addChatContact(id);const session=createOrGetSession(loadChatContacts().find(c=>c.characterId===id)!.id);pushChatMessage({sessionId:session.id,role:"user",content:"【论坛分享】\n"+(post.authorName||"网友")+"\n"+(post.title||"")+"\n"+(post.content||"")});return true;}
 };
 const target=window as unknown as {FloatForumHost?:typeof host;FloatForumBack?:()=>boolean};target.FloatForumHost=host;const nestedBack=()=>!!(frame.current?.contentWindow as ForumWindow)?.forumBack?.();target.FloatForumBack=nestedBack;
 void Promise.all([hydrateChatStorage(),hydrateKvDb()]).then(async()=>{await Promise.all(loadCharacters().map(async c=>{const entries=await loadMemoryEntries(c.id);memories.set(c.id,entries.slice(-20).map(e=>e.content).join("\n"));}));if(active)setReady(true);});
 return()=>{active=false;if(target.FloatForumHost===host)delete target.FloatForumHost;if(target.FloatForumBack===nestedBack)delete target.FloatForumBack;};
 },[]);
 return <PageShell title="论坛" onBack={back}>{ready?<iframe ref={frame} data-testid="square-forum-frame" title="论坛" src="/square-forum/index.html" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads" style={{display:"block",width:"100%",height:"100%",minHeight:"70vh",border:0}}/>:<p role="status">正在载入论坛…</p>}</PageShell>;
}
