// The 20-scenario pool, lifted verbatim from the Chinese Immersion Agent skill.
// The agent rotates through these with no repeats until the pool is exhausted.
export const SCENARIOS = [
  { id: 1, emoji: "☕", zh: "在咖啡馆", en: "At the cafe", role: "咖啡师 (barista)", personality: "热情，健谈 (warm, chatty)" },
  { id: 2, emoji: "🍜", zh: "在餐厅点菜", en: "Ordering at a restaurant", role: "服务员 (waiter)", personality: "耐心，友善 (patient, friendly)" },
  { id: 3, emoji: "🏠", zh: "去朋友家做客", en: "Visiting a friend's home", role: "老朋友 (old friend)", personality: "亲切，爱开玩笑 (warm, jokey)" },
  { id: 4, emoji: "🥬", zh: "在菜市场", en: "At the wet market", role: "菜贩 (vegetable seller)", personality: "爽快，爱讲价 (brisk, loves haggling)" },
  { id: 5, emoji: "💈", zh: "在理发店", en: "At the barber", role: "理发师 (barber)", personality: "专业，爱聊天 (pro, talkative)" },
  { id: 6, emoji: "🚇", zh: "在地铁站问路", en: "Asking directions at the metro", role: "路人甲 (passerby)", personality: "赶时间但好心 (rushed but kind)" },
  { id: 7, emoji: "🌸", zh: "在公园约会", en: "A date in the park", role: "暧昧对象 (a crush)", personality: "害羞，温柔 (shy, gentle)" },
  { id: 8, emoji: "🏥", zh: "在医院看医生", en: "Seeing a doctor", role: "医生 (doctor)", personality: "严谨，关心 (rigorous, caring)" },
  { id: 9, emoji: "🏋️", zh: "在健身房", en: "At the gym", role: "健身教练 (trainer)", personality: "充满活力 (high energy)" },
  { id: 10, emoji: "💼", zh: "在公司开会", en: "In a work meeting", role: "同事 (colleague)", personality: "友好，爱吐槽 (friendly, snarky)" },
  { id: 11, emoji: "✈️", zh: "在机场值机", en: "Airport check-in", role: "地勤 (ground staff)", personality: "高效，礼貌 (efficient, polite)" },
  { id: 12, emoji: "🍺", zh: "在酒吧", en: "At a bar", role: "酒保 (bartender)", personality: "酷，但热心 (cool but warm)" },
  { id: 13, emoji: "📦", zh: "在淘宝退货", en: "A Taobao return", role: "客服 (support agent)", personality: "有点不耐烦 (a bit impatient)" },
  { id: 14, emoji: "📱", zh: "在家庭群聊", en: "In the family group chat", role: "你妈 (your mom)", personality: "唠叨但温暖 (nags but warm)" },
  { id: 15, emoji: "🏨", zh: "在酒店登记", en: "Hotel check-in", role: "前台 (front desk)", personality: "专业，微笑 (professional, smiley)" },
  { id: 16, emoji: "🔧", zh: "在修车厂", en: "At the auto shop", role: "修车师傅 (mechanic)", personality: "粗犷，实在 (rough, honest)" },
  { id: 17, emoji: "💢", zh: "在吵架", en: "In an argument", role: "路人乙 (another passerby)", personality: "脾气暴躁 (hot-tempered)" },
  { id: 18, emoji: "🚄", zh: "在地铁上", en: "On the train", role: "偶遇的同学 (an old classmate)", personality: "惊喜，怀旧 (surprised, nostalgic)" },
  { id: 19, emoji: "📚", zh: "在图书馆", en: "At the library", role: "管理员 (librarian)", personality: "安静，认真 (quiet, serious)" },
  { id: 20, emoji: "💑", zh: "相亲", en: "A blind date", role: "相亲对象 (a blind date)", personality: "紧张，努力找话聊 (nervous, trying hard)" },
];
