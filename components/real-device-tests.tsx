"use client";
import { useState } from "react";
type Test = { label: string; method: string; args?: unknown[]; key?: string; permission?: string; confirm?: string; widget?: boolean };
const basic: Test[] = [
 {label:"电量与充电",method:"getPerceptionSnapshot",key:"battery"}, {label:"网络",method:"getPerceptionSnapshot",key:"network"},
 {label:"步数",method:"getPerceptionSnapshot",key:"steps",permission:"requestStepPermission"},
 {label:"前台应用与无障碍",method:"isAccessibilityConnected",permission:"openAccessibilitySettings"},
 {label:"位置",method:"readLocation",permission:"requestLocationPermission"}, {label:"睡眠",method:"readSleep",permission:"requestHealthPermission"},
 {label:"系统日历",method:"readCalendarEvents",args:[7,0],permission:"calendar"}, {label:"联系人接口能力检查",method:"getPerceptionCapabilities",permission:"requestContactsPermission"},
 {label:"使用统计",method:"readUsageStats",args:[5],permission:"usage"},
 ...[["screen","屏幕与锁屏"],["thermal","设备热状态"],["storage","可用存储"],["media","歌曲感知"],["audio","耳机与音频输出"],["notifications","通知感知"],["notificationCount","通知数量"],["phone","电话状态"],["volume","音量与静音"],["bluetooth","蓝牙连接"],["nfc","NFC"],["share","现实分享"],["nextAlarm","下一次闹钟"]].map(([key,label])=>({label,method:"getRealtimeSnapshot",key,permission:["media","notifications","notificationCount","phone","bluetooth","nfc"].includes(key)?`realtime:${key}`:undefined})),
 {label:"短震动",method:"requestCharacterVibration",confirm:"手机将短震动一次，继续测试？"},
];
const actions: Test[] = [
 ...["手电筒","音量","屏幕亮度","勿扰","打开应用","音乐控制","打开网页"].map(label=>({label:`${label}能力检查`,method:"getDeviceActionCapabilities"})),
 {label:"闹钟",method:"setAlarm",args:[9,0,"小手机测试闹钟"],confirm:"将打开系统时钟，确认后可能创建明天或今天9点的测试闹钟。测试后请在系统时钟删除。继续？"},
 {label:"倒计时",method:"setTimer",args:[60,"小手机测试"],confirm:"将打开系统时钟设置60秒倒计时，继续？"},
];
const sections: Record<string,Test[]> = {
 "感知":basic,
 "操作设备":actions,
 "系统日历":[{label:"日历能力与授权",method:"getCalendarCapabilities",permission:"calendar"},{label:"读取未来7天日程",method:"readCalendarEvents",args:[7,0],permission:"calendar"}],
 "截屏":[{label:"截屏权限与系统支持",method:"getScreenshotCapabilities",permission:"openAccessibilitySettings"},{label:"截屏链路诊断",method:"getScreenshotDiagnostics"},{label:"截屏悬浮球诊断",method:"getScreenshotBallCapabilities"},{label:"实际截屏",method:"captureScreenshot",confirm:"将截取当前屏幕，可能包含私人信息；测试结果只在本机显示，继续？"}],
 "桌面小组件":[{label:"桌面小组件诊断",method:"diagnostics",widget:true},{label:"是否已放到桌面",method:"isPlaced",widget:true}],
};
export function RealDeviceTests({title}:{title:string}) {
 const [results,setResults]=useState<Record<string,string>>({});
 const tests=sections[title]; if(!tests)return null;
 const bridge=(widget=false)=>(window as unknown as Record<string,Record<string,(...args:unknown[])=>unknown>>)[widget?"PhoneWidget":"AndroidShell"];
 const run=(test:Test)=>{
  if(test.confirm&&!window.confirm(test.confirm))return;
  try { const native=bridge(test.widget); if(typeof native?.[test.method]!=="function")throw Error("当前安装包没有此接口；请安装新版 APK");
   let value=native[test.method](...(test.args||[]));if(typeof value==="string"){try{value=JSON.parse(value)}catch{/* native text result */}}
   if(test.key)value=(value as Record<string,unknown>)?.[test.key];
   const detail=value===undefined?"暂无数据：请检查此功能开关、权限和硬件，并产生一次实际事件后重测。":JSON.stringify(value,null,2);
   setResults(old=>({...old,[test.label]:new Date().toLocaleTimeString()+"\n"+detail}));
  }catch(error){setResults(old=>({...old,[test.label]:error instanceof Error?error.message:String(error)}));}
 };
 const grant=(permission:string)=>{try{const n=bridge();if(!n)throw Error("请在安卓 App 内授权");if(permission==="calendar")n.requestCalendarPermission?.(true,false);else if(permission==="usage")n.openSystemSettings?.("usage_stats");else if(permission.startsWith("realtime:"))n.requestRealtimePermission?.(permission.slice(9)==="notificationCount"?"notifications":permission.slice(9));else n[permission]?.();}catch(error){setResults(old=>({...old,"授权":String(error)}));}};
 return <section className="per-card" style={{margin:"18px 0",padding:16,fontSize:"calc(12px * var(--app-text-scale, 1))"}} aria-label="现实功能逐项测试">
 <h3 style={{fontSize:"calc(14px * var(--app-text-scale, 1))",fontWeight:700}}>现实功能逐项测试</h3>
 <p>逐项读取本机结果，不调用 AI、不发送聊天。能力检查仅检查接口与权限，不代表已完成实际操作。数据为空时请先开启对应功能；震动、截屏和时钟测试会先询问确认。</p>
 {tests.map(test=><div key={test.label} style={{padding:"12px 0",borderTop:"1px solid var(--c-card-border)"}}><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{flex:1}}>{test.label}</span><button type="button" className="ui-btn ui-btn-outline" onClick={()=>run(test)}>测试</button>{test.permission&&<button type="button" className="ui-btn ui-btn-outline" onClick={()=>grant(test.permission!)}>检查授权</button>}</div>{results[test.label]&&<pre role="status" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:"inherit",marginTop:8}}>{results[test.label]}</pre>}</div>)}
 <button type="button" className="ui-btn ui-btn-outline" onClick={()=>setResults({})}>清除测试结果</button>{results["授权"]&&<p role="status">{results["授权"]}</p>}
 </section>;
}
