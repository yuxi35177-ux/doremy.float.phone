# 1.0.13 签名测试版打包

1. 仓库 Settings → Secrets and variables → Actions → New repository secret，名称 `SHELL_SIGNING_PASSWORD`，值为自行保存的至少 20 字符随机密码。不要把密码写进代码、网址或 workflow 输入框。密码应长期保留，丢失后无法恢复签名。
2. Actions → Build Android Shell APK → Run workflow，分支选择 `release/doremy-apk-1.0.13`。
3. `site_url` 填自己的 HTTPS 站点地址，勾选 `publish_signed`。没有旧签名且接受使用新签名时，首次勾选 `initialize_signing`。之后不要勾选，构建会自动复用。
4. 等待绿色完成，在仓库 Releases 下载 `Doremy-1.0.13-release.apk`。真实手机功能仍待实机验证。

如果当前 GitHub 页面未显示新增选项，先选好分支再查看；也可将此分支的工作流通过 PR 合入 main 后刷新。不要改动代码里的占位网址。

原有四项 SHELL_KEYSTORE_* Secrets 仍优先使用；有旧签名应配置它们，以保留覆盖升级能力。没有旧私钥时，新签名不能恢复旧 APK 的签名，安装前先导出备份，不要直接卸载。

新签名使用 AES-256-CBC、PBKDF2 600000 次迭代加密后保存为 `android-shell/signing/doremy.keystore.enc`，明文只在构建临时目录使用，不会上传为产物。密码仅保存在 Actions Secret。不要删除加密文件或更换密码，否则后续打包将失败。初始化只在手动选中时发生，推送不会自动创建签名。
