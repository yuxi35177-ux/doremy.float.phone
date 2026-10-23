"use client";

// 感知引擎的挂载点。
//
// 为一个「启动即运行」的模块级单例提供一个 React 生命周期挂钩：
// 挂载时启动采样、卸载时停止。与 ShellPushRegistrar 同一套路——
// 用返回 null 的组件承载副作用，避免把引擎逻辑散进 desktop-shell。
//
// 放在 desktop-shell（主界面）里，壳内全程驻留；普通浏览器里
// startPerception() 会因为 hasPerceptionBridge() 为 false 而空转，无副作用。

import { kvGet } from "@/lib/kv-db";
import { REALTIME_KEY, realtimeNative } from "@/lib/realtime-device";
import { useEffect } from "react";

import { startPerception, stopPerception } from "@/lib/perception";

export function PerceptionBootstrap() {
  useEffect(() => {
    realtimeNative()?.configureRealtime?.(kvGet(REALTIME_KEY) || "{}");
    void startPerception();
    return () => stopPerception();
  }, []);
  return null;
}
