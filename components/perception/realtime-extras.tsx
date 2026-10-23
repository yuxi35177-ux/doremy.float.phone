"use client";
import { useEffect, useState } from "react";
import { kvGet, kvSet } from "@/lib/kv-db";
import { Toggle } from "@/components/ui/form";
const rows = [
 ["screen","屏幕与锁屏","读取亮屏、锁屏状态"], ["thermal","设备热状态","读取系统温控等级"], ["storage","可用存储","读取剩余空间"],
 ["media","歌曲感知","只读取当前播放的歌曲名、歌手；需通知使用权"], ["audio","耳机与音频输出","读取耳机、蓝牙与扬声器类型"],
 ["notifications","通知感知","读取最近通知的应用、标题与正文，最多10条；需通知使用权"], ["notificationCount","通知数量","只读取当前通知条数"],
 ["phone","电话状态","只读取空闲、来电、通话状态，不读号码与通话录音"], ["volume","音量与静音","读取媒体音量与响铃模式"],
 ["bluetooth","蓝牙连接","读取蓝牙开关与耳机连接状态"], ["nfc","NFC 场景卡","仅前台识别标签编号，不写卡片"],
 ["share","现实分享","接收从其他应用分享到本小手机的文字"], ["nextAlarm","下一次闹钟","读取系统登记的下一次闹钟"],
 ["vibrate","角色震动","短震动前仍需点确认"],
] as const;
import { REALTIME_KEY, realtimeNative as native, type RealtimeConfig as Config } from "@/lib/realtime-device";
export function RealtimeExtras(){
 const [config,setConfig]=useState<Config>(()=>{try{return JSON.parse(kvGet(REALTIME_KEY)||"{}")}catch{return {}}});
 const [snapshot,setSnapshot]=useState<Record<string,unknown>>({});
 const refresh=()=>{try{setSnapshot(JSON.parse(native()?.getRealtimeSnapshot?.()||"{}"))}catch{setSnapshot({})}};
 useEffect(()=>{native()?.configureRealtime?.(JSON.stringify(config));refresh()},[config]);
 useEffect(()=>{const handle=()=>{if(document.visibilityState==="visible")refresh()};window.addEventListener("focus",handle);document.addEventListener("visibilitychange",handle);return()=>{window.removeEventListener("focus",handle);document.removeEventListener("visibilitychange",handle)}},[]);
 const update=(key:string,value:boolean)=>{const next={...config,[key]:value};kvSet(REALTIME_KEY,JSON.stringify(next));setConfig(next)};
 const grants=(snapshot.grants||{}) as Record<string,boolean>;
 const permission=(key:string)=>key==="notificationCount"?"notifications":key;
 const supported=!!native()?.getRealtimeSnapshot;
 return <section className="per-card" style={{padding:16,marginTop:18}}>
  <h3 style={{fontWeight:700,marginBottom:10}}>实时感知扩展 · 安卓</h3>
  <p style={{fontSize:12,lineHeight:1.7,marginBottom:12}}>与上面的电量、网络、步数及使用统计共用设置，不重复添加。默认全部关闭。开启“随当前聊天提供”后，所选摘要会发给你配置的模型服务；不会因此额外调用模型。网页只能预览，需安装对应 APK。</p>
  <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"12px 0"}}><span>启用扩展感知</span><Toggle checked={!!config.enabled} onChange={v=>update("enabled",v)}/></div>
  {rows.map(([id,label,desc])=><div key={id} style={{padding:"12px 0",borderTop:"1px solid var(--c-card-border)"}}>
    <div role="group" aria-labelledby={`realtime-${id}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><span id={`realtime-${id}`} style={{flex:1}}>{label}<small style={{display:"block",fontSize:12,color:"var(--c-text)",marginTop:4}}>{desc}</small></span><Toggle checked={!!config[id]} onChange={v=>update(id,v)}/></div>
    <small>{supported?"安卓壳已接通":"当前版本不支持，需安装新 APK"}</small>
    {supported&&config[id]&&["notifications","notificationCount","media","bluetooth","phone","nfc"].includes(id)&&<button type="button" className="ui-btn ui-btn-outline" style={{marginLeft:8,fontSize:12}} onClick={()=>native()?.requestRealtimePermission?.(permission(id))}>{grants[permission(id)]?"检查授权":"去授权"}</button>}
    {id==="vibrate"&&supported&&config.vibrate&&<button type="button" className="ui-btn ui-btn-outline" style={{marginLeft:8}} onClick={()=>native()?.requestCharacterVibration?.()}>测试短震动</button>}
  </div>)}
  <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"12px 0"}}><span>随当前前台聊天提供所选摘要</span><Toggle checked={!!config.inject} onChange={v=>update("inject",v)}/></div>
  <p style={{fontSize:12,lineHeight:1.7}}>快捷设置磁贴：在 vivo 控制中心的“编辑”里添加本应用。后台通知需在系统中允许通知、后台高耗电与自启动；系统是否保活以本机为准。NFC、步数、睡眠依赖硬件或系统服务，不会伪造数据。</p>
  <button type="button" className="ui-btn ui-btn-outline" onClick={()=>{native()?.clearRealtime?.();refresh()}}>清除临时现实记录</button>{" "}
  <button type="button" className="ui-btn ui-btn-outline" onClick={refresh}>重新检测</button>{" "}
  <button type="button" className="ui-btn ui-btn-outline" onClick={()=>native()?.openAppSettings?.()}>打开系统应用设置</button>
  {supported&&<details style={{marginTop:12}}><summary>本机取值与权限状态</summary><pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:11}}>{JSON.stringify(snapshot,null,2)}</pre></details>}
 </section>;
}
