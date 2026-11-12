/* ============================================================
 * levels.js —— 关卡数据（数据驱动，内容与逻辑分离）
 *
 * ★ 后续开发的主要扩展位就在这里：新增关卡 = 新增一份数据，不用改场景代码。
 *
 * 关卡字段说明：
 *   id        关卡编号
 *   title     关卡名
 *   duration  建议体验时长（秒）
 *   bg        场景背景图（可选；不填则用 canvas 绘制的伪 3D 走廊）
 *   bgm       本关 BGM（可选）
 *   sources   刺激源数组：
 *     id      唯一 id
 *     channel 感官通道：light(视觉) / sound(听觉) / touch(触觉) / motion(前庭平衡)
 *     angle   相对正前方的角度（弧度，负值在左，正值在右）
 *     dist    在路径上的位置（0~1）
 *     radius  屏幕投影半径系数（越大越占视野）
 *     power   刺激强度系数（1.0 为基准）
 *     sprite  精灵图（填 config.js 中的资源 key，如 'scenes.spriteLight'）
 *     audio   刺激音效文件路径（可选，后续接入真实音频）
 *     label   调试/无障碍描述文本
 * ============================================================ */

window.GAME_LEVELS = {

  /** 默认关卡：任何未配置的 levelId 都会回落到这里 */
  defaultLevel: {
    id: 1,
    title: '教学楼走廊',
    duration: 90,
    bg: '',
    bgm: '',
    sources: [
      { id: 'light1', channel: 'light', angle: -0.55, dist: 0.18, radius: 0.10, power: 1.0,
        sprite: '', audio: '', label: '闪烁的荧光灯' },
      { id: 'crowd1', channel: 'sound', angle:  0.62, dist: 0.42, radius: 0.12, power: 0.9,
        sprite: '', audio: '', label: '走廊里交叠的人声' },
      { id: 'light2', channel: 'light', angle:  0.05, dist: 0.66, radius: 0.09, power: 1.1,
        sprite: '', audio: '', label: '刺眼的顶灯' },
      { id: 'tag1',   channel: 'touch', angle: -0.30, dist: 0.85, radius: 0.08, power: 0.8,
        sprite: '', audio: '', label: '摩擦的衣领标签' }
    ]
  },

  /* ---------- 关卡 2：教室（示例，可按需删改） ---------- */
  2: {
    id: 2,
    title: '喧闹的教室',
    duration: 120,
    bg: '',
    bgm: '',
    sources: [
      { id: 'chair',  channel: 'sound', angle: -0.7, dist: 0.20, radius: 0.10, power: 1.0, sprite: '', audio: '', label: '椅子拖动声' },
      { id: 'bell',   channel: 'sound', angle:  0.2, dist: 0.48, radius: 0.14, power: 1.3, sprite: '', audio: '', label: '上课铃' },
      { id: 'screen', channel: 'light', angle:  0.0, dist: 0.72, radius: 0.16, power: 1.2, sprite: '', audio: '', label: '投影屏蓝光' },
      { id: 'touch',  channel: 'touch', angle: -0.15, dist: 0.92, radius: 0.08, power: 0.9, sprite: '', audio: '', label: '同桌不经意碰到你' }
    ]
  }

  /* ---------- 新增关卡模板：复制下面这段，改 id 与 sources 即可 ----------
  3: {
    id: 3, title: '超市', duration: 120, bg: '', bgm: '',
    sources: [
      { id: 'x', channel: 'sound', angle: 0, dist: 0.3, radius: 0.1, power: 1, sprite: '', audio: '', label: '广播与购物车' }
    ]
  }
  ------------------------------------------------------------------ */
};
