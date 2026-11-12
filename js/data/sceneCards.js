/* ============================================================
 * sceneCards.js —— 5 个生活场景的元数据（数据驱动，改文案不用动代码）
 *
 * 字段说明：
 *   id        场景唯一标识（★ 后续开发：进入体验场景时用它加载对应关卡）
 *   index     展示序号（01 ~ 05）
 *   title     场景标题
 *   subtitle  一句话副标题
 *   desc      卡片内描述
 *   tags      涉及的感官通道标签（用于卡片上的小标签）
 *   channels  对应 config.sensory.channels 的通道名
 *   fx        卡片内的氛围动效类型（见 ui/Carousel.js 的 SceneFx）
 *   card      卡片背景图（★ 占位符：config.ASSETS.scenes 中的 key）
 *   tint      氛围主色调（用于卡片缺省底色与动效取色）
 *
 * ★ 后续开发：选定场景后走 game.scenes.go('experience', { sceneId: id })
 * ============================================================ */

window.SCENE_CARDS = [
  {
    id: 'classroom',
    index: '01',
    levelId: 1,                  // ★ 第一关已开发：确认后进入 level-intro → level1
    title: '迟到的课堂',
    subtitle: '你推开教室门，所有目光同时转过来',
    desc: '荧光灯在头顶嗡嗡作响，粉笔灰在光柱里翻滚。走廊的回声还没散去，你已经迟到了。',
    tags: ['视觉', '听觉'],
    channels: ['light', 'sound'],
    fx: 'chalk',
    card: 'scenes.cardClassroom',
    tint: '#ffe9a8'
  },
  {
    id: 'park',
    index: '02',
    title: '公园',
    subtitle: '别人眼里的放松，是感官的同时涌入',
    desc: '阳光穿过树叶碎成一片片光斑，风声、蝉鸣、远处的音乐混在一起，分不清哪一声更近。',
    tags: ['视觉', '听觉', '触觉'],
    channels: ['light', 'sound', 'touch'],
    fx: 'leaves',
    card: 'scenes.cardPark',
    tint: '#a8e6b8'
  },
  {
    id: 'supermarket',
    index: '03',
    title: '超市购物',
    subtitle: '冷白灯光下，每一种声音都在抢你',
    desc: '冷柜的嗡鸣、广播的促销、购物车碾过地砖的震动，货架的边界在视野里不断被拉长。',
    tags: ['视觉', '听觉', '触觉'],
    channels: ['light', 'sound', 'touch'],
    fx: 'aisle',
    card: 'scenes.cardSupermarket',
    tint: '#bfe3ff'
  },
  {
    id: 'subway',
    index: '04',
    title: '有小孩哭闹的地铁',
    subtitle: '封闭车厢里，没有可以退开的距离',
    desc: '婴儿的哭声在金属车厢里被反复放大，广播、轨道摩擦、晃动同时发生，出口还很远。',
    tags: ['听觉', '前庭'],
    channels: ['sound', 'motion'],
    fx: 'subway',
    card: 'scenes.cardSubway',
    tint: '#c9b8ff'
  },
  {
    id: 'night',
    index: '05',
    title: '夜晚的房间',
    subtitle: '一天结束后，身体仍没有安静下来',   /* ★ 原标题"夜晚的晚上"，此处措辞可在 config 旁直接改 */
    desc: '灯关了，但白天的声音还在耳边回放。空调的低频、窗外偶有的车声，都变得格外清楚。',
    tags: ['听觉', '视觉'],
    channels: ['sound', 'light'],
    fx: 'night',
    card: 'scenes.cardNight',
    tint: '#8fa3d8'
  }
];
