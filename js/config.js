/* ============================================================
 * config.js —— 全局配置 & 资源清单（★ 替换你的图片从这里开始 ★）
 *
 * 所有美术资源集中在本文件的 GAME_CONFIG.ASSETS 中，
 * 你只需要把 src 换成自己的图片路径，代码其余部分无需改动。
 * 每个资源项字段：
 *   src      图片路径（相对 index.html）
 *   hint     建议尺寸/用途说明，仅作注释用，不影响运行
 *   color    占位兜底色：图片未找到时用它绘制占位块（开发期很方便）
 * ============================================================ */

window.GAME_CONFIG = {

  /* ---------------- 基础设置 ---------------- */
  debug: true,                    // 调试模式：显示 FPS、日志、快捷键

  /* ★ 无障碍开关：降低感官刺激
     打开后：频闪从 12Hz/±30% 降到 6Hz/±8%，震动振幅降到 40%。
     5–30Hz 的闪烁是光敏性癫痫的高风险区间，正式上线建议默认打开，
     或在设置里让玩家自行选择，并在开场给出光敏提示。 */
  reduceSensory: false,

  canvas: {
    maxDelta: 0.05,               // 单帧最大时长（秒），防止切后台回来后物理跳变
    pixelRatioCap: 2              // 高分屏最大像素比，避免手机上过度绘制
  },

  /* ============================================================
   * 背景图上的暗色遮罩（#bg-layer::after）
   * 作用：压暗背景，保证标题与按钮的可读性。
   * ★ 但如果你自己的主视觉已经处理好对比度，它会显得"发灰"——
   *   这里可以直接调：数值是 alpha，0 = 完全不压暗（背景原样），1 = 全黑。
   *   想要更暗就调大，想让背景更亮就调小，改完刷新即可，不用碰 CSS。
   * ============================================================ */
  bgScrim: {
    top: 0.10,                    // 顶部（标题区）
    middle: 0.03,                 // 中部（背景主体，几乎不压暗）
    bottom: 0.22                  // 底部（按钮区）
  },

  /* ============================================================
   * 标题页
   *   showTitleLogo  是否单独渲染一层标题 LOGO
   *     默认 false —— 标题已经做进背景图（assets/ui/bg_title.jpg）里了，
   *     不再渲染文字标题或占位图，免得挡住背景。
   *     想单独叠一层 LOGO 时改成 true，会用 ui.logoTitle 那张图。
   * ============================================================ */
  title: {
    showTitleLogo: false
  },

  /* ============================================================
   * 开始前介绍说明（点击"开始绘本"后弹出的对话框）
   *   lines      正文，一行一段，逐段淡入
   *   hintDelay  多久之后显示"点击任意处关闭"（毫秒，默认 3000）
   *   hintText   那行小字的内容
   * ★ 改文案只改这里，不用动代码
   * ============================================================ */
  intro: {
    title: '',
    hintDelay: 3000,
    hintText: '点击任意处关闭',
    lineInterval: 260,            // 每段正文的间隔（毫秒）
    lines: [
      '这是一个关于感官差异的交互体验。',
      '我们习惯的世界，是大脑自动过滤后的版本——\n灯光的频闪被抹平，背景的噪音被调低，人群的轮廓被简化。\n但对自闭症谱系的人来说，这层“过滤器”常常是失效的。',
      '他们不是不专注，而是无法忽略。\n不是不回应，而是感官正在超载。',
      '在这个作品里，你将用有限的第一视角，进入几个日常场景，\n短暂地感受他们的感官世界。',
      '你可以选择想体验的场景与感官。'
    ]
  },

  /* ---------------- 声音设置 ---------------- */
  audio: {
    startMuted: false,            // 首屏是否静音（移动端浏览器策略建议 true，需用户手势后才能播放）
    masterVolume: 0.8,
    bgm: {
      src: 'assets/audio/bgm_calm.mp3',   // 背景音乐占位路径（文件不存在时自动降级为合成音）
      loop: true,
      volume: 0.35
    },
    // 音效占位：真实音效文件到位后，把 src 填上即可；未填时用 WebAudio 合成"嘀"声兜底
    sfx: {
      click:   { src: '', type: 'sine',     freq: 660,  dur: 0.09 },
      hover:   { src: '', type: 'triangle', freq: 880,  dur: 0.05 },
      back:    { src: '', type: 'sine',     freq: 420,  dur: 0.12 },
      overload:{ src: '', type: 'sawtooth', freq: 180,  dur: 0.35 }
    }
  },

  /* ---------------- 感官系统参数（本作核心机制） ---------------- */
  /* 设计思路：自闭症儿童常存在"感觉处理差异"——同一份感官输入，
     对他们的神经系统可能是放大数倍的。本作把放大过程量化成四条通道，
     让玩家在第一人称视角里真实体会"感官超载"。                     */
  sensory: {
    channels: ['light', 'sound', 'touch', 'motion'],  // 视觉/听觉/触觉/前庭(平衡)
    gainPerChannel: {    // 每条通道的"敏感系数"：越大越容易过载（可在设置里让玩家调）
      light: 1.35,
      sound: 1.25,
      touch: 1.0,
      motion: 1.1
    },
    loadRise:   0.22,    // 注视刺激源时，负载每秒上升速度
    loadDecay:  0.14,    // 无刺激时，负载每秒自然回落速度
    regulate:   0.38,    // 自我调节（按住空格/屏幕）时每秒下降速度
    warnAt:     0.55,    // 负载警戒线
    overloadAt: 0.85,    // 过载阈值：超过后触发画面/音效失真、行动受阻
    recoverAt:  0.45     // 从过载状态恢复的阈值（滞回，避免抖动）
  },

  /* ---------------- 第一人称视角参数 ---------------- */
  player: {
    fov: 75,             // 视场角（度），用于伪 3D 投影
    yawSpeed: 1.6,       // 键盘转向速度（弧度/秒）
    yawDamping: 0.85,    // 鼠标/触摸转向的平滑系数
    moveSpeed: 0.9       // 前进速度（场景单位/秒）
  },

  /* ============================================================
   * 资源清单 —— 全部图片占位符都在这里
   * 替换方式：把 src 改成你的图片路径即可（支持 png / jpg / webp）
   * ============================================================ */
  ASSETS: {

    /* --- UI 通用 --- */
    ui: {
      // 标题页背景大图（建议 1920×1080 或 1280×720，横竖屏各出一张更佳）
      bgTitle:      { src: 'assets/ui/bg_title.jpg',      hint: '1920×1080 标题页背景',   color: '#16203c' },
      bgTitleMobile:{ src: 'assets/ui/bg_title_m.jpg',    hint: '750×1334 竖屏背景（可选）', color: '#16203c' },

      // 开始按钮（normal / hover / pressed 三态，后两态可省略，缺省自动复用 normal）
      btnStart:        { src: 'assets/ui/btn_start.png',        hint: '480×160 开始绘本', color: '#7fd1c1' },
      btnStartHover:   { src: 'assets/ui/btn_start_hover.png',  hint: '480×160 悬停态（可选）', color: '#9ae3d4' },
      btnStartPressed: { src: 'assets/ui/btn_start_press.png',  hint: '480×160 按下态（可选）', color: '#5fb5a6' },

      // 关于按钮（三态同上）
      btnAbout:        { src: 'assets/ui/btn_about.png',        hint: '480×160 关于',     color: '#8fa3d8' },
      btnAboutHover:   { src: 'assets/ui/btn_about_hover.png',  hint: '480×160 悬停（可选）', color: '#a9bae8' },
      btnAboutPressed: { src: 'assets/ui/btn_about_press.png',  hint: '480×160 按下（可选）', color: '#7587c0' },

      // 右上角声音开关（两张：开 / 关，切换时换图）
      btnSoundOn:      { src: 'assets/ui/btn_sound_on.png',     hint: '128×128 声音开启', color: '#7fd1c1' },
      btnSoundOff:     { src: 'assets/ui/btn_sound_off.png',    hint: '128×128 声音关闭', color: '#6b7590' },

      // 返回按钮（关于页 / 游戏内返回）
      btnBack:         { src: 'assets/ui/btn_back.png',         hint: '160×160 返回',    color: '#8fa3d8' },

      // 关于页面板底图（九宫格或整图均可；缺省用 CSS 半透明底）
      panelAbout:      { src: 'assets/ui/panel_about.png',      hint: '1024×768 关于面板（可选）', color: 'rgba(0,0,0,0)' },

      // 标题 LOGO（可选：用图片代替文字标题）
      logoTitle:       { src: 'assets/ui/logo_title.png',       hint: '800×300 标题 LOGO（可选）', color: 'rgba(0,0,0,0)' },

      // ---- 本轮新增：介绍对话框 / 场景选择页 ----
      // 场景选择页背景（建议 1920×1080）
      bgSelect:        { src: 'assets/ui/bg_select.jpg',        hint: '1920×1080 场景选择页背景', color: '#141c33' },

      // 介绍说明对话框的面板底图（建议 1024×768，九宫格亦可）
      panelDialog:     { src: 'assets/ui/panel_dialog.png',     hint: '1024×768 对话框面板',     color: '#121a33' },

      // 「进入这个场景」按钮（三态）
      btnEnter:        { src: 'assets/ui/btn_enter.png',        hint: '480×160 进入场景',        color: '#7fd1c1' },
      btnEnterHover:   { src: 'assets/ui/btn_enter_hover.png',  hint: '480×160 悬停（可选）',    color: '#9ae3d4' },
      btnEnterPressed: { src: 'assets/ui/btn_enter_press.png',  hint: '480×160 按下（可选）',    color: '#5fb5a6' },

      // 左右箭头（切换场景卡片）
      btnArrowLeft:    { src: 'assets/ui/btn_arrow_left.png',   hint: '128×128 上一个场景',      color: '#8fa3d8' },
      btnArrowRight:   { src: 'assets/ui/btn_arrow_right.png',  hint: '128×128 下一个场景',      color: '#8fa3d8' },

      // ---- 第一关新增：伪加载页 / 关卡内 ----
      // 「我准备好了」（三态）
      btnReady:        { src: 'assets/ui/btn_ready.png',        hint: '480×160 我准备好了',      color: '#7fd1c1' },
      btnReadyHover:   { src: 'assets/ui/btn_ready_hover.png',  hint: '480×160 悬停（可选）',    color: '#9ae3d4' },
      btnReadyPressed: { src: 'assets/ui/btn_ready_press.png',  hint: '480×160 按下（可选）',    color: '#5fb5a6' },

      // 「再了解一下」（三态）
      btnKnowMore:        { src: 'assets/ui/btn_know_more.png',       hint: '480×160 再了解一下', color: '#8fa3d8' },
      btnKnowMoreHover:   { src: 'assets/ui/btn_know_more_hover.png', hint: '480×160 悬停（可选）', color: '#a9bae8' },
      btnKnowMorePressed: { src: 'assets/ui/btn_know_more_press.png', hint: '480×160 按下（可选）', color: '#7587c0' },

      // 「休息一下」—— 右上角感官休息按钮（三态）
      btnRest:        { src: 'assets/ui/btn_rest.png',          hint: '320×120 休息一下',        color: '#e0a06a' },
      btnRestHover:   { src: 'assets/ui/btn_rest_hover.png',    hint: '320×120 悬停（可选）',    color: '#f0b98a' },
      btnRestPressed: { src: 'assets/ui/btn_rest_press.png',    hint: '320×120 按下（可选）',    color: '#c8864f' },

      // 关卡伪加载页背景（建议 1920×1080）
      bgClassroom:     { src: 'assets/ui/bg_classroom.jpg',     hint: '1920×1080 关卡加载背景',  color: '#1a2230' },

      // 关卡信息卡面板底图（建议 1024×768，可选）
      panelLevelInfo:  { src: 'assets/ui/panel_level_info.png', hint: '1024×768 信息卡面板（可选）', color: 'rgba(0,0,0,0)' }
    },

    /* --- 游戏内场景素材（第一人称场景后续扩展用） --- */
    scenes: {
      // 例：走廊场景的刺激源精灵（后续可换成 3D 模型 / 全景图 / 序列帧）
      spriteLight:  { src: 'assets/scenes/sprite_light.png',  hint: '256×256 荧光灯（视觉刺激）', color: '#ffe9a8' },
      spriteCrowd:  { src: 'assets/scenes/sprite_crowd.png',  hint: '256×256 人群（听觉刺激）',   color: '#8fa3d8' },
      spriteTag:    { src: 'assets/scenes/sprite_tag.png',    hint: '256×256 衣物标签（触觉刺激）', color: '#d97a7a' },
      spriteFloor:  { src: 'assets/scenes/sprite_floor.png',  hint: '512×512 地面纹理（可选）',   color: '#2a3350' },
      // 第一人称画面边缘暗角 / 失真遮罩（过载时叠加）
      maskVignette: { src: 'assets/scenes/mask_vignette.png', hint: '1024×1024 暗角遮罩（可选）', color: 'rgba(0,0,0,0)' },

      // ---- 本轮新增：5 张场景选择卡片图（建议 900×1200 竖版 3:4） ----
      cardClassroom:   { src: 'assets/scenes/card_classroom.jpg',   hint: '900×1200 迟到的课堂', color: '#3a3520' },
      cardPark:        { src: 'assets/scenes/card_park.jpg',        hint: '900×1200 公园',       color: '#1f3a2a' },
      cardSupermarket: { src: 'assets/scenes/card_supermarket.jpg', hint: '900×1200 超市购物',   color: '#1c2c3c' },
      cardSubway:      { src: 'assets/scenes/card_subway.jpg',      hint: '900×1200 地铁',       color: '#2a2440' },
      cardNight:       { src: 'assets/scenes/card_night.jpg',       hint: '900×1200 夜晚的房间', color: '#161c33' },

      /* ★ 看黑板交互的底图（第 5 个交互点，1672×940 教室实景）
         注意：同一个 key 只能出现一次，重复声明时后者会静默覆盖前者。 */
      boardClassroom: { src: 'assets/scenes/l1/board_classroom.jpg',
                        hint: '1672×940 教室黑板底图（红色公式在 x≈0.58 y≈0.45）',
                        color: '#25303f' },

      /* 旧版教室元素占位图（l1Bg/l1Door…）已随第一关改为交互电影而停用，
         文件仍保留在 assets/scenes/l1/，代码不再引用。 */
    }
  }
};
