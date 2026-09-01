# YouTube 播放列表视频

把一串 YouTube 链接变成一段连续的视频。项目自带一个浏览器编辑器。

## 概述

`render-playlist` 接收一个 `tracks` 列表，然后：

1. 从你已经登录好的 Chrome 里读取 YouTube cookie，这样受限视频也能像公开视频一样
   下载——没有登录会话时它会暂停并要求你先登录；
2. 用私有的 `render-track` 子工作流渲染每个条目，同时只让少量曲目在跑，结果再按
   顺序收回；
3. 把片段拼接起来，发布到编辑器能播放的位置。

每首曲目：下载音频、归一化响度、从中提取逐帧频谱，再在无头浏览器里用 HTML 模板
渲染每一帧并与音频封装到一起。某个曲目失败时只有该条目被剔除，运行随后暂停，询问
是否用其余曲目继续。

## 模板

**[`ui/templates/`](./ui/templates/) 里的模板是画面长什么样的唯一事实来源**——
工作流只把封面图、配色和频谱交给它们，自己完全不做像素处理。每个模板是共享同一个
文件名的三个文件（标记、样式，以及每帧调用一次的绘制脚本），这个文件名就是选中它的
`style` 值。要新增一个：把三件套复制成新名字，让复制出来的标记指向自己的两个文件，
再把这个名字登记到 `model-compose.yml` 的 `style` 选项和编辑器的按样式常量里。

模板按五种画面比例的*逻辑*画面来排版，共享运行时再把它缩放到渲染所要求的分辨率。
编辑器的预览跑的是同一份代码，只是编辑时曲目还只是一个 URL，于是用一段合成频谱顶替。

## 颜色

配色（primary、secondary、accent、text）是纯粹的输入，`model-compose.yml` 不会计算
它。每个 `tracks[]` 条目带着自己的 `colors`；渲染原样转发拿到的东西，没有时回落到
一套中性默认值。

从封面推导配色完全发生在浏览器里：编辑器对封面做量化，给出一套可以接受也可以修改的
配色，提交时它手里是什么就发出去什么。所以渲染永远不会和预览不一致——它不自己算颜色。
在命令行里则要自己跑一遍提取，再作为 `colors` 传进去。

## 响度

YouTube 原样返回上传者当初母带的响度，所以由不同视频拼起来的播放列表在每个片段边界
都会跳音量。归一化用的是现成组件，而且模式比数值更重要：LUFS 测量的是整体响度
（ITU-R BS.1770）而不是振幅，并把增益压在真峰值上限之下。它需要两个额外的 Python 包
（见[前置条件](#前置条件)）；带峰值限制的 RMS 模式除了 numpy 什么都不需要，但没法
对齐两首曲目实际*听起来*有多响。

## 准备工作

### 前置条件

- 已安装 model-compose
- Google Chrome（或 Chromium）——登录步骤会连上它
- `PATH` 中有 `ffmpeg`（以及 `ffprobe`）
- Playwright Chromium：`playwright install chromium`
- `yt-dlp`：`pip install yt-dlp`
- 一个供 yt-dlp 反机器人求解器使用的 JS 运行时——安装 `deno`，否则下载会以
  `Requested format is not available` 失败
- `pedalboard` 和 `pyloudnorm`：`pip install pedalboard pyloudnorm`
  （仅 LUFS 需要；替代方案见[响度](#响度)）

### 以远程调试方式启动 Chrome

用一个专门的配置文件，免得和你日常的会话冲突：

**macOS**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-yt-profile
```

**Linux**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-yt-profile
```

**Windows (PowerShell)**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir=$env:TEMP\chrome-yt-profile
```

让那个窗口一直开着，并在里面登录 YouTube。除非你清掉该配置文件或 Google 让 cookie
过期，否则会话会跨多次运行保持有效。

### 环境配置

```bash
cd examples/media-processing/youtube-to-playlist-video
```

`RENDER_CONCURRENCY` 决定同时渲染多少首曲目。保持小一点：响度归一化会把整首解码后的
曲目放在内存里，所以提高并发消耗的是内存，而不只是 CPU。

## 运行方式

1. **启动服务**

   ```bash
   model-compose up
   ```

2. **打开编辑器** http://localhost:8081

   添加一首曲目并粘贴链接，标题、艺术家、封面和配色会自己填好。改你想改的，在顶栏
   选好样式和输出设置，然后按 Render。

3. **或者通过 HTTP 触发渲染**

   `render-track` 是私有的；`render-playlist` 是唯一公开的渲染工作流，所以单曲目就是
   一个只有一项的 `tracks` 列表：

   ```bash
   curl -X POST http://localhost:8080/api/workflows/runs \
     -H 'Content-Type: application/json' \
     -d '{"workflow_id":"render-playlist","wait_for_completion":true,"output_only":true,
          "input":{"fps":30,"width":1080,"height":1920,
                   "tracks":[{"youtube_url":"https://www.youtube.com/watch?v=...",
                              "title":"Track Title","artist":"Artist Name"}]}}'
   ```

   除 `youtube_url` 外都是可选的。`style` 填模板的文件名。`cover_image` 是服务端直接
   打开的文件系统路径，不是 URL；省略它就在没有封面图的情况下渲染。`colors` 放在该
   曲目自己的 `tracks[]` 条目内。响应里带着成品视频的路径和它被提供的 URL。这条路径
   同样会执行登录步骤，所以可能停下来等 Chrome；通过任务 API 继续即可。

## 注意事项

- `yt-dlp` 直接下载音频而不是播放它，所以比录制一次真实播放快得多
  （可对比 [capture-youtube-video](../../web-automation/capture-youtube-video/)）。
- 请尊重源视频的使用条款和版权。
- 视频和封面落在 `ui/.output/` 下，好让编辑器通过 HTTP 提供它们；中间音频落在
  `.output/`。两者都在 gitignore 里。
