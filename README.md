# LanRoom · 局域网通知房间

一个按钮，让同一个房间里所有人的 Windows 桌面同时弹出通知。全部流量都在局域网内，
不经过任何服务器。

![icon](app-icon.png)

## 功能

- **自动发现房间**：打开即列出同一局域网内其他人创建的房间，无需填 IP
- **创建 / 加入 / 退出房间**：进入前必须填写昵称
- **一键广播通知**：点击大按钮，或按全局快捷键（默认 `Ctrl + Alt + D`），房间内所有人
  收到一条 Windows 系统通知
- **3 秒防抖**：两次发送之间强制间隔 3 秒，按钮与全局快捷键共用同一道闸门；冷却期间
  按钮显示倒计时环，快捷键按下会提示剩余时间
- **执行回执**：接收方收到后会回传确认，发送方额外收到一条系统回执通知（可在设置里关闭）
- **可自定义**：快捷键、通知标题、通知正文（支持 `{nick}` `{room}` `{time}` 占位符）
- **托盘常驻**：关闭窗口后收进系统托盘，全局快捷键依然生效
- **单例模式**：重复启动只会唤起已有窗口
- **自动更新**：从 GitHub Release 拉取新版本，minisign 签名校验

## 技术栈

| 层 | 选型 |
| --- | --- |
| 外壳 | Tauri 2 |
| 前端 | React 19 + TypeScript + Tailwind CSS 4 + Vite |
| 后端 | Rust（UDP 广播、系统通知、全局快捷键、托盘、更新） |

### 局域网协议

所有客户端监听 **UDP 47932**。每个在房间里的节点每 2 秒广播一次自己的 `Presence`，
任何人收到就能据此还原出「房间 → 成员」的完整视图：

| 包 | 用途 |
| --- | --- |
| `Presence` | 心跳 + 房间信息，用于房间发现与成员列表 |
| `Notify` | 广播通知内容 |
| `Ack` | 接收方单播回传给发送方的执行回执 |
| `Bye` | 离开房间 |

没有中心服务器，房主退出也不会影响房间继续存在（房主标记会自动落到最早加入的人身上）。
成员超过 7 秒没有心跳即从列表移除。

每个包会同时发往 `255.255.255.255` 和本机所在子网的广播地址，以覆盖多网卡场景；
接收端按 `mid` 去重，因此同一份通知只会弹一次窗。

## 开发

```bash
npm install
npm run app:dev     # 启动 Tauri 开发模式（前端 HMR）
npm run build       # 只构建前端 + 类型检查
```

纯前端预览（不需要 Tauri，用假数据）：

```bash
VITE_MOCK=1 npx vite build --outDir dist-mock
python -m http.server 4173 --directory dist-mock
# http://127.0.0.1:4173/           大厅
# http://127.0.0.1:4173/?view=room  房间页
# http://127.0.0.1:4173/?view=room&settings=1  设置面板
```

### Windows 编译环境

Rust 侧固定用 MSVC：`stable-x86_64-pc-windows-msvc`（rustup 在 Windows 上的默认目标），
链接器来自 Visual Studio Build Tools（安装时勾选「使用 C++ 的桌面开发」）。

```powershell
rustup default stable-x86_64-pc-windows-msvc   # 通常已是默认值
npm run app:build
```

## 构建安装包

```bash
# 需要签名私钥（见下节），否则不会生成更新包
export TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/lanroom.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你的密码"
npm run app:build
```

产物位于 `src-tauri/target/release/bundle/nsis/`：`LanRoom_0.1.1_x64-setup.exe`（安装包）
与 `.sig`（自动更新签名）。本地手动发布时再执行一次：

```bash
node scripts/make-latest-json.mjs   # 生成 latest.json
```

把 `setup.exe`、`setup.exe.sig`、`latest.json` 一起上传到 Release 即可（CI 里
`tauri-action` 会自动完成这一步）。

## 发布与自动更新

自动更新端点已配置为
`https://github.com/Mahiro-Fox/lan-room/releases/latest/download/latest.json`。

1. 升版本号（自动改好 `tauri.conf.json`、`package.json`、`Cargo.toml` 与两个 lock 文件的根版本）：

   ```bash
   npm run bump 0.1.2                 # 也可用 npm run bump patch / minor / major
   npm run bump 0.1.2 -- --dry-run    # 只看会改哪些文件
   ```

   > 不要用全局搜索替换版本号：`Cargo.lock` 里 `byteorder-lite`、`vswhom` 等依赖也是
   > `0.1.x`，被一起改掉会直接导致项目编译失败。
2. 在仓库 Settings → Secrets and variables → Actions 添加：
   - `TAURI_SIGNING_PRIVATE_KEY`：`.tauri/lanroom.key` 的完整内容
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成密钥时设置的密码
3. 提交并打 tag：

```bash
git commit -am "chore: bump to 0.1.2"
git tag v0.1.2 && git push origin main --tags
```

GitHub Actions 会构建、签名并创建 Release，同时上传 `latest.json`。已安装的旧版本在
下次启动（或手动点「检查更新」）时就会提示升级。

> 私钥丢了就无法再给已安装的客户端推送更新，务必自行备份 `.tauri/lanroom.key`。
> 公钥已经写死在 `tauri.conf.json` 的 `plugins.updater.pubkey` 中。

## 排查

| 现象 | 处理 |
| --- | --- |
| 看不到别人的房间 | 确认在同一网段；首次运行时在 Windows 防火墙弹窗中允许「专用网络」 |
| 提示端口被占用 | 关掉占用 UDP 47932 的程序（`netstat -ano \| findstr 47932`） |
| 快捷键没反应 | 组合可能被其他软件占用，启动时会自动回退到可用组合并在界面提示；也可到设置里重选 |
| 收不到系统通知 | 确认系统「专注助手」未开启、LanRoom 在「通知和操作」中已允许；运行 `LanRoom.exe --test-toast` 可自检 |
| 通知只在安装版出现 | Windows 的 Toast 依赖开始菜单快捷方式，开发模式下可能不显示属正常现象 |

## 目录

```
src/                  前端（React）
  components/         欢迎页、大厅、房间、设置抽屉
  lib/api.ts          invoke 封装 + mock 开关
src-tauri/
  src/net.rs          UDP 发现 / 通知 / 回执
  src/lib.rs          应用装配（单例、快捷键、托盘、更新）
  src/commands.rs     暴露给前端的命令
  src/settings.rs     设置读写
  src/shortcut.rs     快捷键字符串解析
  src/toast.rs        Windows 通知
  src/tray.rs         托盘菜单
  src/updater.rs      自动更新
scripts/              图标生成、协议联调工具
```

## 许可

MIT
