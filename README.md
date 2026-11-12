# 感官之旅 · 自闭症儿童第一人称感官体验（H5 框架）

零依赖、无构建：直接双击 `index.html` 就能跑；所有美术资源都已生成**带标注的占位图**，
你把自己的图片按同名路径覆盖即可，代码一行都不用改。

## 当前进度

- ✅ 开始前菜单（介绍对话框 → 场景选择轮播）
- ✅ **第一关「迟到的课堂」= 交互电影**（视频 + 暂停交互，完整可玩）
- ⏳ 其余 4 个场景待开发（卡片已就位，选中后落到占位页）
- ⏳ 视频5 播完后的复杂交互（第 5 个交互点）待设计

> **进入关卡**：点击「迟到的课堂」卡片即可（与调试键 `4`/`5` 效果一致）。
> 其余 4 个场景尚未开发，确认后落到 `pending` 占位页。
> 开发完一关后，在 `js/data/sceneCards.js` 对应卡片加 `levelId: N` 即可接入。

```
标题页
  └─ 点击「开始游戏」
       └─ 介绍对话框（逐段淡入 → 3 秒后可点任意处关闭）
            └─ 场景选择页（5 个生活场景，左右滑动 + 卡片动效）
                 └─ 课堂（唯一带 levelId:1 的卡片）
                       └─ 伪加载页 → [我准备好了] → 关卡信息卡 → A→B→C→D → 结束
```

第一人称通用原型 `ExperienceScene.js` 仍保留备用（见 §9）。

---

## 1. 目录结构

```
sensory-journey/
├── index.html                 入口：分层 DOM + 脚本加载顺序
├── css/style.css              全部样式（按钮与卡片尺寸在这里统一控制）
├── js/
│   ├── config.js              ★ 全局配置 + 资源清单 + 介绍文案（换图改文案只改这里）
│   ├── main.js                启动入口（加载资源 → 注册场景 → 建 HUD）
│   ├── core/
│   │   ├── EventBus.js        事件总线（模块解耦）
│   │   ├── AssetLoader.js     图片预加载 + 占位兜底
│   │   ├── AudioManager.js    全局声音控制（右上角按钮控制的就是它）
│   │   ├── Input.js           键盘 / 鼠标 / 触摸统一输入
│   │   ├── Scene.js           场景基类（生命周期约定）
│   │   ├── SceneManager.js    场景注册与切换
│   │   └── Game.js            主循环 / 画布 / 全局服务
│   ├── ui/
│   │   ├── ImageButton.js     ★ 图片按钮组件（所有按钮都用它）
│   │   ├── Dialog.js          ★ 介绍对话框（逐段淡入 + 延迟出现的关闭提示）
│   │   └── Carousel.js        ★ 场景轮播（3D coverflow + 5 种卡片氛围动效）
│   ├── scenes/
│   │   ├── TitleScene.js      标题页（背景图 + 开始 + 关于）
│   │   ├── AboutScene.js      关于页
│   │   ├── SceneSelectScene.js★ 选择生活场景（本轮核心）
│   │   ├── PendingScene.js    选定后的落点（下一步开发的交接点）
│   │   └── ExperienceScene.js 第一人称体验原型（暂未注册，下一步用）
│   └── data/
│       ├── sceneCards.js      ★ 5 个生活场景的元数据
│       └── levels.js          关卡数据（第一人称体验用）
├── assets/
│   ├── ui/                    UI 图片（按钮、背景、面板）
│   ├── scenes/                场景卡片图 + 精灵图
│   └── audio/                 音频（放 bgm_calm.mp3 / 音效）
└── tools/
    ├── gen_placeholders.py    重新生成占位图
    └── smoke_test.js          无浏览器冒烟测试
```

---

## 2. 运行

```bash
# 方式一：直接打开（file:// 可用，本项目未使用 ES Module）
双击 index.html

# 方式二：本地服务器（推荐，避免个别浏览器对本地文件的限制）
cd sensory-journey
python3 -m http.server 8080     # 然后访问 http://localhost:8080

# 冒烟测试（验证改动后框架仍能跑通，覆盖完整前置流程）
node tools/smoke_test.js

# 图片链路体检（按钮图片没显示时先跑这个）
node tools/check_assets.js

# 第一关「交互电影」测试（时间轴 + 转码校验 + 交互 + 选择题）
node tools/movie_test.js

# 菜单流程测试（保留）
node tools/smoke_test.js
```

> ★ **新增测试脚本必须显式 `process.exit(0)`**：
> 主循环持续用 `requestAnimationFrame` 派发定时器，
> 不显式退出的脚本会"跑完逻辑但进程不结束"，表现为卡住（exit 124）。

# 浏览器内自查：F12 控制台执行
game.assets.report()      # { total, ok, missing, allFailed }
```

### 2.1 背景遮罩太重 / 太轻？改这里

背景图上层有一层暗色渐变（`#bg-layer::after`），强度在 `js/config.js`：

```js
bgScrim: { top: 0.10, middle: 0.03, bottom: 0.22 }   // alpha，0=不压暗，1=全黑
```

**调大 = 更暗，调小 = 背景更亮。** 默认值已调得很淡，避免压暗你自己设计的主视觉。
改完刷新即可，不用碰 CSS。

> ⚠ **请用本地服务器打开，不要双击 index.html。**
> 代码里已刻意不设置 `img.crossOrigin`（file:// 下会因 CORS 导致图片全部加载失败），
> 但仍有其它本地文件限制，本地服务器是最省事的办法。

调试快捷键（`config.debug = true` 时生效）：`1` 标题页 · `2` 关于页 · `3` 场景选择页 ·
`4` 关卡伪加载页 · `5` 直接进入第一关 · `0` 重看介绍 · `M` 静音切换 ·
选择页内 `← →` 切换、`回车` 确认。

---

## 3. 替换你的图片（重点）

> **图片没显示？先看这里。** 三个排查入口：
> 1. 浏览器控制台执行 `game.assets.report()` —— 直接告诉你几张没加载、缺的是哪些
> 2. 终端执行 `node tools/check_assets.js` —— 静态体检（路径、key 拼写、按钮实际 src）
> 3. **不要用 file:// 双击打开**（见 §2 的说明），用 `python3 -m http.server 8080`

### 3.1 图片清单与建议尺寸

把你的图片**按下面的文件名**放进 `assets/ui/` 或 `assets/scenes/` 覆盖即可。
想改路径或文件名，去 `js/config.js` 的 `ASSETS` 里改 `src`。

| 文件 | 建议尺寸 | 用途 | 代码位置 |
|---|---|---|---|
| `assets/ui/bg_title.jpg` | 1920×1080 | 标题页背景 | `config.ASSETS.ui.bgTitle` |
| `assets/ui/bg_title_m.jpg` | 750×1334 | 竖屏背景（可选） | `ui.bgTitleMobile` |
| `assets/ui/btn_start.png` | 480×160 | **开始游戏**按钮 | `ui.btnStart` |
| `assets/ui/btn_start_hover.png` | 480×160 | 开始·悬停态（可选） | `ui.btnStartHover` |
| `assets/ui/btn_start_press.png` | 480×160 | 开始·按下态（可选） | `ui.btnStartPressed` |
| `assets/ui/btn_about.png` | 480×160 | **关于**按钮 | `ui.btnAbout` |
| `assets/ui/btn_about_hover.png` | 480×160 | 关于·悬停态（可选） | `ui.btnAboutHover` |
| `assets/ui/btn_about_press.png` | 480×160 | 关于·按下态（可选） | `ui.btnAboutPressed` |
| `assets/ui/btn_sound_on.png` | 128×128 | **声音开启**图标 | `ui.btnSoundOn` |
| `assets/ui/btn_sound_off.png` | 128×128 | **声音关闭**图标 | `ui.btnSoundOff` |
| `assets/ui/btn_back.png` | 160×160 | 返回按钮 | `ui.btnBack` |
| `assets/ui/panel_about.png` | 1024×768 | 关于面板底图（可选） | `ui.panelAbout` |
| `assets/ui/logo_title.png` | 800×300 | 标题 LOGO（可选，缺省用文字） | `ui.logoTitle` |
| `assets/scenes/sprite_light.png` | 256×256 | 荧光灯（视觉刺激源） | `scenes.spriteLight` |
| `assets/scenes/sprite_crowd.png` | 256×256 | 人群（听觉刺激源） | `scenes.spriteCrowd` |
| `assets/scenes/sprite_tag.png` | 256×256 | 衣领标签（触觉刺激源） | `scenes.spriteTag` |
| `assets/scenes/sprite_floor.png` | 512×512 | 地面纹理（可选） | `scenes.spriteFloor` |
| `assets/scenes/mask_vignette.png` | 1024×1024 | 暗角遮罩（可选） | `scenes.maskVignette` |
| `assets/ui/bg_select.jpg` | 1920×1080 | **场景选择页背景** | `ui.bgSelect` |
| `assets/ui/panel_dialog.png` | 1024×768 | **介绍对话框面板** | `ui.panelDialog` |
| `assets/ui/btn_enter.png` | 480×160 | **进入场景**按钮 | `ui.btnEnter` |
| `assets/ui/btn_enter_hover.png` | 480×160 | 进入·悬停（可选） | `ui.btnEnterHover` |
| `assets/ui/btn_enter_press.png` | 480×160 | 进入·按下（可选） | `ui.btnEnterPressed` |
| `assets/ui/btn_arrow_left.png` | 128×128 | 上一个场景箭头 | `ui.btnArrowLeft` |
| `assets/ui/btn_arrow_right.png` | 128×128 | 下一个场景箭头 | `ui.btnArrowRight` |
| `assets/scenes/card_classroom.jpg` | 900×1200 | 迟到的课堂卡片 | `scenes.cardClassroom` |
| `assets/scenes/card_park.jpg` | 900×1200 | 公园卡片 | `scenes.cardPark` |
| `assets/scenes/card_supermarket.jpg` | 900×1200 | 超市购物卡片 | `scenes.cardSupermarket` |
| `assets/scenes/card_subway.jpg` | 900×1200 | 地铁卡片 | `scenes.cardSubway` |
| `assets/scenes/card_night.jpg` | 900×1200 | 夜晚的房间卡片 | `scenes.cardNight` |
| `assets/ui/btn_ready.png` | 480×160 | **我准备好了** | `ui.btnReady` |
| `assets/ui/btn_ready_hover.png` | 480×160 | 准备·悬停（可选） | `ui.btnReadyHover` |
| `assets/ui/btn_ready_press.png` | 480×160 | 准备·按下（可选） | `ui.btnReadyPressed` |
| `assets/ui/btn_know_more.png` | 480×160 | **再了解一下** | `ui.btnKnowMore` |
| `assets/ui/btn_know_more_hover.png` | 480×160 | 再了解·悬停（可选） | `ui.btnKnowMoreHover` |
| `assets/ui/btn_know_more_press.png` | 480×160 | 再了解·按下（可选） | `ui.btnKnowMorePressed` |
| `assets/ui/btn_rest.png` | 320×120 | **休息一下**（感官休息） | `ui.btnRest` |
| `assets/ui/btn_rest_hover.png` | 320×120 | 休息·悬停（可选） | `ui.btnRestHover` |
| `assets/ui/btn_rest_press.png` | 320×120 | 休息·按下（可选） | `ui.btnRestPressed` |
| `assets/ui/bg_classroom.jpg` | 1920×1080 | 关卡伪加载页背景 | `ui.bgClassroom` |
| `assets/ui/panel_level_info.png` | 1024×768 | 关卡信息卡面板（可选） | `ui.panelLevelInfo` |

> 第一关的教室元素见 §6.1（`assets/scenes/l1/` 共 11 张）。
> 这些是**占位图**而不是 canvas 绘制：场景 = 一张全景背景 + 若干元素图，
> 换美术只需替换同名文件。感官特效（频闪/隧道视野/过曝）仍是 canvas 后期，
> 那是模拟本身，不属于场景美术。

> 按钮尺寸在 `css/style.css` 的 `.btn-start / .btn-about / .btn-sound / .btn-back` 里改 `width`，
> 图片会按宽度等比缩放，做图时按建议尺寸出即可，不必完全一致。

### 3.2 换图示例

```js
// js/config.js
btnStart: { src: 'assets/ui/btn_start.png', hint: '480×160 开始游戏' },
// 改成你自己的：
btnStart: { src: 'assets/ui/my_start_btn@2x.png', hint: '480×160 开始游戏' },
```

### 3.3 加一个新按钮（如"设置"）

```js
// js/scenes/TitleScene.js 的 init() 里，复制开始按钮的写法：
var btnSetting = new ImageButton({
  className: 'btn-setting',          // 尺寸在 CSS 里加一条 .btn-setting{width:...}
  alt: '设置',
  image:   A.get('ui.btnSetting'),   // ← 在 config.ASSETS.ui 里加一行 btnSetting
  onClick: function () { self.game.scenes.go('setting'); }
});
menu.appendChild(btnSetting.el);
```

**图片加载失败不会崩**：`ImageButton` 会自动降级为带文字的占位按钮，并打印缺失清单到控制台，
方便你先跑通逻辑、后补美术。

---

## 4. 声音控制说明

- 右上角按钮由 `Game.buildGlobalHUD()` 创建，挂在 `#hud-layer`，**跨场景常驻**，任何页面都能用。
- 点击后调用 `AudioManager.toggleMute()`，通过 `masterGain` 淡入淡出 0.15s，不会爆音。
- 按钮图标在 `开/关` 两张图之间切换（config 里的 `btnSoundOn` / `btnSoundOff`）。
- 浏览器自动播放策略：首次播放必须由用户手势触发，已在按钮点击与 `main.js` 的首次点击里解锁。
- 真实音频接入：把 `assets/audio/bgm_calm.mp3` 放进去即可自动播放；音效在 `config.audio.sfx`
  里填 `src`（目前用 WebAudio 合成音兜底，无音频文件也能听到反馈）。

---

## 5. 开始前菜单（本轮已完成）

### 5.1 介绍对话框

- 位置：`js/ui/Dialog.js`（通用组件，剧情旁白也能复用）
- 调用：`TitleScene.showIntro()` —— 点击「开始游戏」触发
- 规则：正文逐段淡入 → 约 3 秒后底部出现一行小字「点击任意处关闭」→ **提示出现后才允许关闭**（防止误触跳过）
- ★ 改文案：`js/config.js` 的 `GAME_CONFIG.intro`（`lines` 数组一行一段，`\n` 会换行）

```js
intro: {
  hintDelay: 3000,               // 几毫秒后出现关闭提示
  hintText: '点击任意处关闭',
  lines: ['第一段…', '第二段…']
}
```

### 5.2 场景选择页

- 位置：`js/scenes/SceneSelectScene.js` + `js/ui/Carousel.js`
- 交互：左右拖拽滑动（带惯性与吸附）、点两侧卡片滑到中间、点中间卡片直接确认、
  左右箭头按钮、键盘 `← →` 与 `回车`、PC 滚轮横滑
- 动态效果：
  1. **3D coverflow** —— 卡片随离中心的距离做缩放 / 旋转 Y / 位移 Z / 淡出
  2. **卡片氛围动效** —— 每张卡片内嵌 canvas，5 种专属动效：
     课堂（粉笔灰 + 灯光频闪）、公园（落叶 + 光斑）、超市（货架线条流动 + 冷白闪）、
     地铁（车厢晃动 + 哭声涟漪）、夜晚（星闪 + 呼吸光晕）
  3. **选中态** —— 描边光晕 + 描述文字展开 + 底部说明同步
  4. **确认转场** —— 卡片放大发光，整页下沉淡出

### 5.3 五个场景（改文案/顺序/增删）

`js/data/sceneCards.js`，一份数据一张卡：

```js
{
  id: 'subway', index: '04',
  title: '有小孩哭闹的地铁',
  subtitle: '封闭车厢里，没有可以退开的距离',
  desc: '婴儿的哭声在金属车厢里被反复放大…',
  tags: ['听觉', '前庭'], channels: ['sound', 'motion'],
  fx: 'subway',                    // 卡片动效类型
  card: 'scenes.cardSubway',       // ★ 卡片背景图
  tint: '#c9b8ff'
}
```

> 第 5 个场景原标题是「夜晚的晚上」，我按语义改成了**「夜晚的房间」**，
> 副标题"一天结束后，身体仍没有安静下来"。想改回或换名字，改 `sceneCards.js` 里那一行即可。

---

## 6. 第一关「迟到的课堂」—— 交互电影（已开发）

### 6.0 流程总览

```
点击「迟到的课堂」卡片
  └─ level-intro 伪加载页（进度条 → [我准备好了] [再了解一下]）
        └─ level1 关卡信息卡（点击开始）
              └─ 视频时间轴（7 步，见 js/data/level1.js 的 timeline）
```

| 步 | 视频 | 行为 |
|---|---|---|
| 0 | 视频1（8.41s） | 直接播放 |
| 1 | 视频2（2.02s） | **停在首帧** → 交互①点击右上「敲门」→ 播完 |
| 2 | 视频3（9.78s） | **停在首帧** → 交互②点击左下「门把手」→ 播完 |
| 3 | 视频3 末帧 | 选择①：A 回座位 / B 去教室外面站着<br>选 B → 移除 B、重播视频3（跳过交互②）→ 再问 |
| 4 | 视频4（5.58s） | 播放，前 4 秒悬浮座位算式 |
| 5 | 视频4 末帧 | 选择②：4 选 1，选错提示并移除该选项 |
| 6 | 444 seg6（10.71s） | 播放 |
| 7 | 444 seg6 末帧 | **交互⑤ 受限视野看黑板**：拖动找红色公式，30 秒 |
| 8 | 444 seg7（18.34s） | 选对公式后播放 → 播完 → 结束面板 |

> 视段全部使用：视频6 在选对公式后播放，播完结束。

### 6.1 文件结构

| 文件 | 职责 |
|---|---|
| `js/core/VideoPlayer.js` | 视频播放与精确暂停（RAF 巡检，非 timeupdate） |
| `js/ui/InteractLayer.js` | 叠加交互层：点击四象限 / 选择题 / 悬浮文字 |
| `js/scenes/VideoLevelScene.js` | 关卡主控：时间轴推进、分支、竖屏、跳过 |
| `js/data/level1.js` | **全部剧情与参数**（timeline / interacts / quiz / 文案） |

### 6.2 ★ 视频必须 H.264（原片是 HEVC）

你给的六段原片是 **HEVC/H.265**，浏览器支持情况：

| 浏览器 | HEVC | H.264 |
|---|---|---|
| Chrome / Edge（Win、Linux、**安卓**） | ✗ 黑屏 | ✓ |
| Firefox | ✗ | ✓ |
| Safari / iOS | ✓ | ✓ |

**H5 主要在手机端跑，安卓 Chrome 占绝大多数会直接黑屏**，所以已全部转码：

```bash
ffmpeg -i 源.mp4 -c:v libx264 -preset medium -profile:v high -level 4.2 \
  -pix_fmt yuv420p -b:v 8M -maxrate 10M -bufsize 16M -r 60 -s 1920x1080 \
  -c:a aac -b:a 128k -movflags +faststart out.mp4
```

- 规格：**1080p60 / 8Mbps / H.264 + AAC**，六段共 **48MB**
- `+faststart`：索引移到文件头，**可边下边播**（原片 moov 在文件尾，必须整段下载才能播）
- 校验：`node tools/movie_test.js` 会自动 ffprobe 六段，非 H.264 / 非 1080p60 / 无 faststart 都会报错

### 6.3 交互设计要点

- **四象限容错 = 整个象限**：右上角就是 `x≥0.5 且 y<0.5`，左下同理，点错不了
- **坐标按视频可见区域算**：视频是 `object-fit: contain`，上下有黑边，
  按屏幕算会导致"点左下判成点中间"
- **不画点击区域框**：只用一行文字提示（"点击此处敲门"），
  框会暴露可点区域边界，破坏沉浸感
- **点错反馈**：提示文字连闪 3 下，不消失
- **精确暂停**：`timeupdate` 只有 4Hz（250ms 误差）会错过暂停点，
  用 `requestAnimationFrame` 巡检（<17ms）
- **竖屏**：暂停 + 遮罩提示旋转，转回横屏从暂停处继续（交互中不自动恢复）
- **对比度**：所有叠加面板用深实底（alpha ≥ .92）+ 纯白字，
  半透明浅底在亮画面上会糊；`tools/_contrast.js` 自动校验 WCAG ≥ 4.5:1

### 6.4 座位算式

每次随机生成排/列（都在 **4~6**），用一位数加减呈现，例如：

```
我的座位在第 (11-5) 排 第 (9-3) 列
```

显示到视频4 第 4 秒。选择题 4 个选项全部落在 4~6 区间，**干扰项也必须真算**，
靠排除法蒙不对。选错 → 提示 + 移除该选项，直到选对。

### 6.4½ 交互⑤：受限视野看黑板（视频5 播完）

用 `assets/scenes/l1/board_classroom.png`（1672×940 教室实拍/插画）模拟
"看得见但看不清"的状态：

| 机制 | 说明 |
|---|---|
| 视野窗口 | 椭圆，面积约占全图 **18%**，只有中心清晰 |
| 周边 | 模糊 + 去饱和 + 压暗（预渲染成离屏 canvas，每帧只 drawImage） |
| 自动漂移 | 正弦叠加的缓慢随机游走，玩家必须不断往回修正 |
| 阻尼迟滞 | `follow: 0.055`，视野跟不上手 |
| 注意力被夺 | 每 7~12 秒视野突然跳到干扰点（时钟/国旗/窗外/公告栏/绿植）1.6 秒 |
| **不缩小视野** | 明确要求：只在窗口边缘做渐暗特效，窗口尺寸恒定 |

**交卷**：对准红色公式停留 **2 秒**自动进入选择（视野上有进度环可视化），
或 30 秒到自动交卷。

**选错**：保持当前视野位置**不重置**，再给 10 秒，循环直到选对。
干扰项：`y = ax³ / y = a / x / y = ax + b / y = x² + a`，选错移除该选项。

**关键参数**（`js/data/level1.js` 的 `board`）：

```js
view:  { w: 0.24, h: 0.24 },        // 视野半轴 → 面积 ≈18%
focus: { x: 0.579, y: 0.452, w: 0.16, h: 0.34 },   // 红色公式判定区
firstSec: 30, retrySec: 10, holdSec: 2.0
```

> **干扰点位置是估计值**（时钟/国旗/窗外/公告栏/绿植）。
> 你在真机上看到视野跳过去的地方不对，改 `board.distract.points` 里的 x/y 即可。

### 6.5 按钮：纯 CSS，不依赖图片

`.btn` 系列（见 `css/style.css` 与 `js/ui/CssButton.js`）：

| 变体 | 用途 |
|---|---|
| `.btn--primary` | 主行动：开始绘本 / 我准备好了 |
| `.btn--ghost` | 次级：关于 / 再了解一下 |
| `.btn--icon` | 图标：声音 / 返回 / 左右箭头 |
| `.btn--choice` | 选择题选项 |
| `.btn--pill` | 小胶囊：跳过 |

样式语言：玻璃拟态 + 主色渐变 + 内高光 + 微光边框，尺寸用 `clamp()` 自适应。
移动端不用 `:hover`（触屏没有），全部走 `:active`。

## 7. 想改第一关的剧情

全部在 `js/data/level1.js`，改完刷新即可，不用碰代码。

**加一个交互点**（在 timeline 里插一步）：

```js
{ seg: 5, pauseAt: 'end', interact: 'myNewQuiz' }
```

**改交互区域**（四象限容错，整个象限都算命中）：

```js
handle: { region: 'bottom-left', hintFull: '点击左下的门把手' }
```

**改座位算式区间 / 显示时长**：

```js
seatMath: { showUntilSec: 4.0, rowRange: [4, 6], colRange: [4, 6] }
```

**视频放哪**：`assets/video/seg1.mp4 … seg6.mp4`，文件名规则在
`LEVEL1.video = { dir, prefix, ext }`。换片时同步更新 `LEVEL1.durations`。

---

## 8. 其余关卡的交接点

### 8.1 新关卡怎么挂进菜单

第一关已接入：卡片 `levelId: 1` → 点击后走 `level-intro` → `level1`。
`confirm()` 里的分流规则是按 `levelId` 判断的，所以**后续关卡只需两步**：

1. 在 `js/data/sceneCards.js` 对应卡片上加 `levelId: N`
2. 注册 `levelN` 场景

第二关可以直接复用 `VideoLevelScene`：复制一份 `js/data/level2.js`（timeline + 文案），
再注册 `game.scenes.register('level2', new VideoLevelScene(game))` 并把数据指向 level2 即可。

### 8.2 ★ 已修复：关卡里什么都点不动（CSS 特异性）

**症状**：进入第一关后所有交互都失效——点门、点黑板、点椅子全无反应。

**原因**（两个坑叠在一起）：

1. `#ui-layer > *{ pointer-events: auto; }` 的特异性是 `(1,0,0)`，
   把 `.lvl-hud{ pointer-events: none; }`（`(0,1,0)`）**盖掉了**。
   而 `.lvl-hud` 是 `inset: 0` 的全屏容器 → 变成可点击 → 铺满整屏吞掉所有点击。
2. `Input.js` 的 `isUIEvent()` 用 `closest('.lvl-hud')` 判断，
   于是每一次点击都被当成"点在 UI 上"直接 `return`。

**修复**：选择器写成 `#ui-layer > .lvl-hud`（`(1,1,0)`）才压得住；
并给纯展示部件 `.lvl-hint` / `.lvl-sub` 单独关掉命中。

**为什么测试没抓到**：之前的测试直接 `bus.emit('input:down')`，绕过了真实 DOM 命中路径；
且桩件的 `closest()` 永远返回 null。现已修好三处：
桩件实现真实 `closest()`；测试改用"派发 pointerdown 到 #app 并带 target"；
另加**静态 CSS 特异性检查**（`tools/_csscheck.js`）——运行时桩件不做 CSS 级联，
这类问题只能靠算特异性发现。

> 教训：**`#ui-layer` 的直接子元素都会继承 `pointer-events: auto`**。
> 任何全屏容器挂上去之前，先确认它是否真的需要接收点击。

### 8.3 ★ 已修复：关卡按钮提前出现在菜单上

**症状**：开机后「休息一下」「退出」就浮在标题页和选关页上，挡住点击。

**原因**：`SceneManager.register()` 在启动时会立刻调用每个场景的 `init()`，
而 `Level1Scene` 当初在 `init()` 里就把 HUD 挂到了 `ui-layer` —— 于是关卡 UI
从一开机就存在于 DOM 中，且 `.lvl-hud` 是 `inset: 0` 的全屏容器。

**修复**：`Level1Scene` 改为**延迟建 DOM**，只在第一次 `enter()` 时才创建
（`_ensureUI()`），进入关卡前它在 DOM 里根本不存在。回归用例已加进
`tools/smoke_test.js`：标题页阶段断言不存在 `.lvl-hud`，
且"进过关卡再退回菜单"后 HUD 必须隐藏。

> 这条约定适用于所有后续场景：**`init()` 里不要挂 DOM，UI 一律放到首次 `enter()`。**

用户选定场景后，流程停在 `PendingScene`（回显所选场景 + 返回按钮）。
要接入第一人称体验，改两处：

```js
// ① index.html：放开这行注释
<script src="js/scenes/ExperienceScene.js"></script>

// ② js/main.js 的 setupScenes() 里加一行
game.scenes.register('experience', new ExperienceScene(game));

// ③ js/scenes/SceneSelectScene.js 的 confirm()：把 pending 换成 experience
self.game.scenes.go('experience', { sceneId: item.id });
```

`ExperienceScene` 已带完整机制闭环（伪 3D 走廊、四条感官通道、过载与自我调节），
接入后只需要用 `sceneId` 去 `js/data/levels.js` 里取对应关卡数据。

---

## 9. 第一人称玩法骨架（ExperienceScene，备用）

当前用**伪 3D Canvas**实现（无需任何美术即可运行），机制闭环已打通：

| 机制 | 实现位置 | 说明 |
|---|---|---|
| 环视视角 | `_updateLook()` | 鼠标位置 / 拖拽 / A·D 转向，带阻尼平滑 |
| 刺激源投影 | `project()` | 角度+距离 → 屏幕坐标；换成真 3D 时保留此约定即可 |
| 感官负载 | `_updateSensory()` | 视线对准刺激源 → 通道强度↑ → 总负载累积 |
| 过载状态 | `_updateSensory()` | 超过 0.85 触发（画面抖动、噪点、色偏、视野收缩），带滞回恢复 |
| 自我调节 | `_updateSensory()` | 按住空格 / 按住屏幕 → 负载下降，这是要传达的核心动作 |
| 前进受阻 | `_updateMove()` | 负载越高前进越慢，过载时几乎寸步难行 |

参数全部集中在 `config.js`：`sensory`（阈值/速率/敏感系数）、`player`（FOV/转向/速度）。

### 关卡数据驱动

`js/data/levels.js` 里新增一份即可，`GameScene.loadLevel()` 会自动读取：

```js
3: {
  id: 3, title: '超市', duration: 120, bg: '', bgm: '',
  sources: [
    { id: 'x', channel: 'sound', angle: 0.3, dist: 0.30, radius: 0.10,
      power: 1.0, sprite: '', audio: '', label: '广播与购物车' }
  ]
}
```

---

## 10. ★ 已修复的两个 Bug（历史记录）

### 10.1 关卡里什么都点不动（CSS 特异性）

`#ui-layer > *{ pointer-events: auto }`（特异性 1,0,0）盖掉了
`.lvl-hud{ pointer-events: none }`（0,1,0），全屏容器变成可点击，吞掉所有点击。
修法：写成 `#ui-layer > .lvl-hud`（1,1,0）。已加静态 CSS 特异性检查
（`tools/_csscheck.js`）防复发。

### 10.2 ★ 已修复：选择面板"播完直接重播，第二次才弹选择"

**症状**：视频3 播完没有弹选择，而是立刻重播了一遍；第二次播完才弹。

**原因**：时间轴里同一个视频写了两步 ——

```js
{ seg: 3, pauseAt: 'start', interact: 'handle' }   // 首帧点门把手后播放
{ seg: 3, pauseAt: 'end',   interact: 'quizStay' } // ← 又 load 了一遍 seg3！
```

播完第一步 → `_next()` 进入第二步 → **重新加载并播放同一段** → 播完才弹选择。
视频4 与座位选择题是同一个坑。

**修复**：加 `reuse: true`，表示"接在上一段播完的末帧"，不再重新加载：

```js
{ seg: 3, pauseAt: 'end', interact: 'quizStay', reuse: true }
```

**黄金规则**：**同一个 seg 在 timeline 出现两次时，第二次必须是 `reuse`**
（除非是有意的重播分支）。回归用例已锁死：`movie_test.js` 会检查所有重复段号，
并真跑一遍验证"播完立刻弹选择 + 该段只加载 1 次"。

另外修掉一个相关错误：原先用 `_replaying` 跳过"中段交互"的判断会**误跳过选择题本身**，
已删除 —— 重播的是视频，选择是播完之后必须给的。

### 10.3 ★ 视觉调整：不画点击区域框 + 对比度

- **点击交互不再画高亮框**：框会暴露"可点区域边界"，破坏第一人称沉浸感。
  现在只有一行文字提示（"点击此处敲门"），点错时提示文字连闪 3 下。
- **所有叠加面板改为深实底（alpha ≥ .92）+ 纯白字 + 描边**：
  半透明浅底遇到亮画面会糊成一片。右上角声音按钮也从"半透明白底"改为
  "深色半透明底 + 白描边 + 白图标"。
- 已加 **WCAG 对比度自动校验**（`tools/_contrast.js`）：
  半透明底色按"合成到纯白"的最坏情况计算，要求 ≥ 4.5:1。当前实测 18:1。

### 10.4 ★ 已修复：看黑板交互的四个问题

**① 拖动方向反了**
原来是"拖动画面 → 视野反向移动"（`target = base - delta`），拖左视野反而向右。
改成**视野跟着手指走**（`target = base + delta`）：拖左→看左边。
若想要"抓着画面拖"的手感，把 `LEVEL1.boardGaze.dragInvert` 设为 `true`。

**② 视野外全黑**
`dim: 0.86` 让外围几乎全黑，玩家不知道该往哪拖。降到 **0.40**——
配合降采样模糊做到"看得见但看不清"。这个数别超过 0.55。

**③ 选错后题目不消失**
`onWrong` 只调了 `gaze.resume()`，没清掉选择面板 → 题目一直盖在上面。
现在：先让"选错"反馈显示 0.9 秒 → `interact.clear()` 让题目消失 →
回去看 10 秒 → 时间到再重新问。

**④ 选对了不播视频6**（最严重）
选对的回调里只调了 `onDone()`，而它对 `pauseAt:'end'` 来说**是个空函数**，
所以永远停在视频5。补上 `self._next()` 才真正推进时间轴。

> 相关：顺手清掉了 `config.js` 里**重复的 `boardClassroom` key**
> （同一对象字面量里重复声明，后者会静默覆盖前者）。

### 10.5 ★ 已修复：视野外围不够黑 + 拖动干扰不足

**① 视野外必须全黑（我上一版理解反了）**

上一轮把"视野外全黑"当成了 bug 并调亮到 `dim: 0.40`，**那是误读**——
用户要的就是全黑（管状视野）。现已改回 **`dim: 1.0`**，外围填纯色。

顺带优化：`dim >= 0.99` 时走纯色填充分支，**不再绘制模糊底图**
（反正会被完全盖住），省一次全屏 `drawImage`。

**② 拖动干扰（"难度太低"）**

| 干扰 | 参数 | 值 |
|---|---|---|
| 打滑 | `drag.gain` | 0.80（手指挪 1 格，视野只跟 0.8 格） |
| 随机偏移 | `drag.noise` | 0.035（每次 move 抖一下） |
| 高频抖动 | `drag.jitterAmp` | 0.12（阻尼后实际波动 ≈0.06） |
| 拖动更迟滞 | `drag.dragDampingScale` | 0.6 |
| 拖动时漂移加倍 | `drag.dragDriftScale` | 1.8 |
| 注意力被夺更频繁 | `hijack.everyMin/Max` | 2.8 ~ 5.0 秒 |
| 基础漂移加大 | `drift.ampX/Y` | 0.032 / 0.026 |

**核心手感**：拖的时候几乎抓不住，**松手才能稳住**。
这是刻意设计的——`_dragging` 为 true 时才叠加高频抖动，
松开手指后只剩基础漂移（0.028），玩家能停在目标区完成 2 秒驻留。
测试已锁死"松手后停留占比 100%"，保证不会因干扰过大而永久卡关。

**③ 顺带修的真 bug：负 dt 让视野乱飞**

`dt` 由时间戳差算出，只做了上限 clamp 没做下限。时间戳回退
（切后台、或任何乱序调用）会算出负 dt，乘进阻尼系数后
视野朝反方向猛跳一大截。现已 clamp 到 `[0, 0.05]`。

### 10.6 ★ 新增：渐进聚焦 / 起始点 / 方向凸起 / 拖动限速 / 卡片放大

**① 开场极模糊，逐步看清**

新增两档模糊源：`_blurSrc`(1/12) 与 `_blurHeavy`(1/28)。
窗口内叠加重度模糊层，用 **alpha 混合**淡出（不用 `ctx.filter`，手机上太慢）。

曲线用 **easeInQuad（k²）** 而非 easeOut——easeOut 起步就掉得快
（k=25% 已清晰 58%），达不到"前几秒非常模糊"。k² 的实际效果：

| 进度 | 25% | 50% | 75% | 100% |
|---|---|---|---|---|
| 剩余模糊 | 94% | 75% | 44% | 0% |

参数 `boardGaze.focusIn = { sec: 5.0, from: 1.0 }`。

**② 视野起始不在正中心**

`boardGaze.start = { x: 0.16, y: 0.80 }`——左下角，距目标横向 0.43，
玩家必须主动找。

**③ 方向凸起提示**

视野圆圈边缘朝目标方向鼓出一个包（`bump`）：距离越远凸起越明显，
接近目标后自动消失。比箭头含蓄，又比纯盲找友好。

**④ 拖动限速（"速度太快了"）**

`pointermove` 不再直接改 `target`，而是写入 `_pending`（原始意图）；
`update()` 里按 **`drag.maxSpeed = 0.16`（归一化/秒）** 逐步逼近。
手指甩得再快，视野也只能慢慢跟——横穿全图约需 **6.3 秒**。

**⑤ 选关卡片放大**

| | 原来 | 现在 |
|---|---|---|
| 横屏宽度上限 | 380px | 470px |
| 竖屏宽度上限 | 340px | 400px |
| 宽高比 | 1.34 | 1.42 |

`scene-card__desc`（介绍文字）**不再折叠**——原来只有选中卡片才展开，
现在常态可见（超长时 3 行截断）。

### 10.7 ★ 视频换成 444 包（7 段）+ 新增闹铃交互

**素材映射**（444 的 seg1 是新增段，seg2~seg7 = 原 555 的 seg1~seg6）：

| 444 | 时长 | 对应原流程 |
|---|---|---|
| seg1 | 3.51s | **新增**：闹钟段（交互⓪） |
| seg2 | 4.92s | 原 seg1 前半（迟到赶路） |
| seg3 | 2.02s | 原 seg2（敲门） |
| seg4 | 9.78s | 原 seg3（门把手 → 进教室 → 选择①） |
| seg5 | 7.32s | 原 seg4（找座位 + 选择②） |
| seg6 | 10.71s | 原 seg5（坐下后 → 看黑板） |
| seg7 | 18.34s | 原 seg6（点名 → 结束） |

因此**时间轴所有段号整体 +1**，交互点对应关系不变。

**新增交互⓪：关掉闹铃**

- 播完未点击 → **重播本段**。重播用 `seek(0) + play()`，
  **不重新 load**（每次 load 会重新走网络，手机上每次重播都黑屏一下）。
- 点击屏幕**任意处**即关闹铃 → 立即进入第二段。
  用 DOM 捕获监听，但要忽略 `.vl-tools / .btn / button`，
  否则点右上角"跳过/退出"会被误判成关闹铃。
- 提示：全屏居中大字 + 呼吸闪烁，沿用 18:1 深底白字。
- **每次重播提示加强**：字号 `1 → 1.12 → 1.24 → 1.36`，
  闪烁 `2.6s → 2.0s → 1.6s → 1.4s`。
- **兜底**：重播 3 次后自动放行（`alarm.maxLoops = 3`），
  防止用户没看懂而永久卡住。

参数在 `js/data/level1.js` 的 `alarm`。

**冷备**：444 的 HEVC 原片保留在 `/data/workspace/444_extracted/`，
未删除；H.264 转码产物在 `/data/workspace/444_h264/`。

### 10.8 ★ 已修复：闹铃段被自动跳过 + 卡片还是不够大

**① 闹铃段"放几次就被跳过"（用户还没点）**

根因：兜底参数 `alarm.maxLoops = 3` —— 重播 3 次后自动放行。
这**与需求"重复播放直到用户点击屏幕"直接相悖**，是我的设计失误
（当初为防卡死加的兜底，实际体验中是负面的）。

改为 **`maxLoops: 0` = 无限重播，直到用户点击**。
`maxLoops <= 0` 时永不自动放行；只有显式设为正整数才启用兜底。
测试锁死：连播 8 次仍必须停留在本段，且提示强度封顶在最后一档（1.36）不无限变大。

**② 顺带修的真 bug：RAF 巡检会在重播时永久停摆**

`VideoPlayer._start()` 的 tick 第一行是
`if (video.paused || video.ended) return;`。
但 `play()` 是**异步**的——刚调用时 `paused` 可能仍是 `true`，
于是第一帧就 return，RAF 链断掉，`frame` 事件再也不触发
（影响座位算式等按时间消失的逻辑）。
已加 10 帧宽限期：期间继续排队，超时才真正停。

**③ 选关卡片再次放大**

第一版放大到 470/400 仍不够，这次显著放开上限：

| | 初版 | 第一版 | **现在** |
|---|---|---|---|
| 横屏宽度上限 | 380px | 470px | **660px** |
| 竖屏宽度上限 | 340px | 400px | **560px** |
| 宽度占屏 | ~20% | 26% | **34%** |

实测（1280×720）：435×617px，占屏宽 34% / 屏高 86%。
介绍文字**去掉 3 行截断**，完整显示；标题 3.8→4.2vmin，正文 2.05→2.25vmin。

### 10.9 ★ 已修复：闹铃点不动 / 选项白底白字 / 判定区可校准

**① 闹铃"点了也没反应，卡在第一步"（最严重）**

根因**不是逻辑写错，而是监听压根没绑上**：上次写入时脚本触发断言失败中断，
只有 `exit()` 里的清理代码留了下来，`addEventListener` 那几行从未进入文件。

即便写进去也存在隐患：原方案绑在 `this.el` 上，而 `_build()` **每次进关卡都重建
`this.el`**，监听会随旧 DOM 一起失效；且它放在 `_bindAudioWatch()` 里，
受 `_audioWatching` 单次保护，第二次进关卡就不再绑定。

修复：抽出独立的 `_bindAlarmWatch()`，**绑在 `#app`（稳定根节点）**，
每次 `enter()` 都调用（同一 handler 引用重复注册会被浏览器自动去重，安全）。
测试锁死三条：真实派发 `pointerdown` 到 `#app` 能关闹铃、
**二次进入关卡后点击仍有效**、绑定不在 `_bindAudioWatch` 内。

**② 选项按钮"白底白字看不清"**

原来是 `rgba(255,255,255,.15)` 半透明白底 + 白字。在亮画面（教室黑板）上
叠出来接近全白，白字完全糊掉。改为**不透明浅底 `#ffffff→#e8eef7` + 黑字 `#0a0f1c`**，
任何背景下对比度都稳定在 ~15:1。选中/错误态也统一用深字。

**③ 「看黑板」判定区：已左移 + 给了校准入口**

`boardGaze.target` 从 `{x:0.53, y:0.34}` 改为 **`{x:0.46, y:0.30, w:0.16, h:0.26}`**
（中心 0.59 → 0.54，向左放宽并加大容错）。

自动检测供参考（黑板区域两个主要红色块）：

| 中心 | 面积 | 推测 |
|---|---|---|
| (0.554, 0.385) | 2076 | 中部偏上，疑似公式 `y=ax²` |
| (0.591, 0.488) | 13632 | 面积大，疑似抛物线曲线 |

**校准方法（推荐自己微调）**：debug 模式下按 **数字键 9** 进入校准模式，
画面会画出判定区的**黄色虚线框** + 视野中心**红色十字** + 实时坐标与"是否命中"。
照着红色公式的实际位置改 `js/data/level1.js` 的 `boardGaze.target` 即可：

- 往**左**移 → 调小 `x`；往**上**移 → 调小 `y`
- 命中范围更大 → 调大 `w` / `h`

改完刷新页面生效。

### 10.10 ★ 已修复：选关页返回按钮"不见了" + 去掉主界面标题占位

**① 返回按钮消失（CSS 特异性，和 10.1 是同一类问题）**

`.btn` 基础规则在 style.css **第 847 行**写了 `position: relative`；
而 `.select-back{position:absolute}` 写在**第 466 行**，同为 `(0,1,0)` 特异性
→ **后者覆盖前者**，按钮变成普通文档流元素、排到 flex 列末尾，
被挤到页面底部甚至视口外，表现为"返回按钮不见了"。

左右箭头 `.btn-arrow` 有**完全相同的问题**（也会掉进文档流）。

修复：把这类定位选择器写成**双类**以提高特异性：

```css
.btn.btn-arrow   { ... }   /* (0,2,0) 胜出 */
.btn.select-back { ... z-index: 30; }
```

顺带加固：`.btn.about-back` / `.btn.pending-back` 同样处理，
并把所有 `env(safe-area-inset-*)` 补上 `, 0px` 回退
（不支持时整条 `calc()` 会失效，定位直接丢失）。

新增静态检查 `tools/_csscheck.js` 的 `checkBtnPosition()`：
自动扫描"写在 `.btn` 基础规则之前、且用了 `position:absolute` 的按钮类"
并重名为双类写法。已验证它能捕获回退（改回单类立刻报错）。

**② 主界面标题占位已去掉**

标题已经做进背景图，不再渲染任何文字标题或占位图。
开关在 `js/config.js`：

```js
title: {
  showTitleLogo: false    // true 则恢复单独一层 LOGO（用 ui.logoTitle）
}
```

是**开关而非硬删除**——`TitleScene.js` 里保留分支，随时可打开。

### 10.11 ★ 测试桩件的两个"假阴性"

修 bug 时发现测试自己也在骗人，一并修了：

1. **`el.innerHTML = ''` 不清子节点** → 重渲染后 `children` 里残留旧按钮，
   测试点到已移除的旧元素上，表现为"点了没反应"。
2. **`dispatch()` 不补 `preventDefault`** → 业务代码调 `e.preventDefault()` 直接抛错。

现在 `innerHTML` 用 `defineProperty` 实现（赋空串即清空 children），
`dispatch()` 自动补全标准事件方法。

### 10.12 关卡按钮提前出现在菜单上

`SceneManager.register()` 启动即调 `init()`，若在其中挂 DOM，关卡 UI 会从开机就存在。
修法：**`init()` 不挂 DOM，UI 延迟到首次 `enter()`**。

> 该坑同样适用于 `VideoLevelScene`（用 `_built` 标记 + 延迟 `_build()`）。

---

## 11. 后续开发扩展点

**待办**：第 5 个交互点已完成（受限视野看黑板）。
后续若要再加交互，在 `timeline` 里插入一步即可。

| 你想做的事 | 改哪里 |
|---|---|
| 加一个页面（设置、结算、关卡选择） | 新建 `js/scenes/XxxScene.js` 继承 `Scene` → 在 `main.js` 的 `setupScenes()` 里 `scenes.register()` |
| 加一个生活场景 | `js/data/sceneCards.js` 加一份数据 + 放一张卡片图，代码不用动 |
| 换卡片动效 | `js/ui/Carousel.js` 的 `SceneFx`，加一个 `_xxx()` 方法并在 `_init()` 的映射表里登记 |
| 换成真 3D（three.js / 全景图） | 保留 `project()` 的输出约定（x/y/scale），替换 `_drawCorridor()` |
| 接入真实音效与空间音频 | `AudioManager.play()` 里加载 buffer；刺激源加 `audio` 字段 |
| 接入剧情旁白 / 字幕 | 用 `bus.emit('story:show', {...})`，在 HUD 层订阅播放 |
| 埋点与数据分析 | 在 `bus.on('scene:change')`、`sensory` 阈值事件处上报 |
| 无障碍设置（降低闪烁、关闭抖动） | `config.sensory` 增加开关，`_drawOverloadFX()` 读取 |
| 多语言 | 文案抽到 `js/data/copy.js`，按钮用 `ImageButton.setAlt()` 更新 |

### ⚠️ 内容伦理提示
闪烁、噪点、抖动会诱发不适，正式版本请务必：**提供"降低感官刺激"开关**、癫痫与光敏警示，
以及随时退出的按钮。本作是科普共情作品，个体差异极大，文案中不要声称"这就是自闭症的真实感受"。

---

## 12. 占位图重新生成

```bash
pip install pillow
python3 tools/gen_placeholders.py     # 图上有尺寸与用途标注，方便对照替换
```
