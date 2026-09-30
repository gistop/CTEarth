// ================= 典型地貌数据（科教面板） =================
// 数据驱动：新增/替换地貌只需编辑本文件，科教面板自动更新。
// camera 的 heading/pitch/roll 为弧度（与 Cesium camera.flyTo 直接对接）。
// image 为 public/landforms/ 下的图片文件名，缺图时卡片自动隐藏缩略图。

export type LandformTypeId = 'desert' | 'river' | 'glacier' | 'coastal' | 'loess' | 'catastrophic' | 'agriculture';

export const LANDFORM_TYPES: Array<{ id: LandformTypeId; label: string }> = [
  { id: 'desert', label: '风成' },
  { id: 'river', label: '河流' },
  { id: 'glacier', label: '冰川' },
  { id: 'coastal', label: '海岸' },
  { id: 'loess', label: '黄土' },
  { id: 'catastrophic', label: '灾害' },
  { id: 'agriculture', label: '农业' },
];

export const LANDFORM_TYPE_LABEL: Record<LandformTypeId, string> = {
  desert: '风成',
  river: '河流',
  glacier: '冰川',
  coastal: '海岸',
  loess: '黄土',
  catastrophic: '灾害',
  agriculture: '农业',
};

// 场景标注点（flyTo 后在三维场景中显示）
export type LandformLabel = { text: string; lon: number; lat: number; height: number };

export type LandformCamera = {
  lon: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
};

export type Landform = {
  id: string;
  name: string;
  type: LandformTypeId;
  summary: string;
  image?: string;
  labels: LandformLabel[];
  camera: LandformCamera;
};

export const TYPICAL_LANDFORMS: Landform[] = [
  // ---- 风成地貌 ----
  {
    id: 'desert-barchan', name: '新月形沙丘', type: 'desert',
    summary: '风成沙丘的基本形态，两尖角指向下风向，背风坡为陡峭滑落面。',
    image: 'xinyuexingshaqiu.jpg',
    labels: [{ text: '新月形沙丘', lon: 30.35, lat: 25.63, height: 1000 }],
    camera: { lon: 30.35022495792962, lat: 25.616201153597274, height: 1059.4464007629224, heading: 0.025867410494416987, pitch: -0.6235591118914914, roll: 0.00001098563385504292 },
  },
  {
    id: 'desert-transverse', name: '横向沙丘', type: 'desert',
    summary: '沙丘走向与主导风向垂直，呈链状向下游方向推移。',
    image: 'hengxiangshaqiu.jpg',
    labels: [{ text: '横向沙丘', lon: -74.73128321008154, lat: -15.157867439340015, height: 3280.4682668562477 }],
    camera: { lon: -74.73128321008154, lat: -15.157867439340015, height: 3280.4682668562477, heading: 0.2204895927119237, pitch: -1.556419503435233, roll: 0 },
  },
  {
    id: 'desert-linear', name: '线形沙丘', type: 'desert',
    summary: '沿风向延伸的纵向沙丘，两侧均有风沙补给。',
    image: 'xianxingshaqiu.jpg',
    labels: [{ text: '线形沙丘', lon: 26.2, lat: 24.33, height: 1000 }],
    camera: { lon: 26.21906865418122, lat: 25.061838265827255, height: 173696.08809200034, heading: 3.1415926535898526, pitch: -1.1061922181351331, roll: 3.141592653589779 },
  },
  {
    id: 'desert-star', name: '星沙丘', type: 'desert',
    summary: '多风向作用下形成的金字塔状沙丘，脊线向多个方向放射。',
    image: 'xingshaqiu.jpg',
    labels: [{ text: '星沙丘', lon: 9, lat: 30.3653, height: 1000 }],
    camera: { lon: 9.000340430746014, lat: 30.328640495263894, height: 48659.90986201562, heading: 0.10427199372496254, pitch: -1.565260216631121, roll: 0 },
  },
  {
    id: 'desert-dome', name: '圆顶沙丘', type: 'desert',
    summary: '穹形过渡形态沙丘，坡面无明显滑落面。',
    image: 'yuandingshaqiu.jpg',
    labels: [{ text: '圆顶沙丘', lon: 9, lat: 30.3653, height: 1000 }],
    camera: { lon: 83.56552628976152, lat: 40.28634649201418, height: 47316.895602046214, heading: 3.202867438523689, pitch: -1.468240970131109, roll: 3.1438064533624273 },
  },
  {
    id: 'desert-collision', name: '沙丘碰撞', type: 'desert',
    summary: '两种沙丘相遇合并的现象，可观察沙丘形态的此消彼长。',
    image: 'shaqiupengzhuang.jpg',
    labels: [{ text: '沙丘碰撞', lon: 51.497913244426144, lat: 24.930672180391163, height: 500 }],
    camera: { lon: 51.497913244426144, lat: 24.930672180391163, height: 1246.7963569218095, heading: 3.0549236588374926, pitch: -1.4970462994445013, roll: 3.141336965320523 },
  },
  // ---- 河流地貌 ----
  {
    id: 'river-meander-mamore', name: '河曲沙洲（马莫雷河）', type: 'river',
    summary: '玻利维亚马莫雷河，侧蚀与堆积造就河曲、沙洲与牛轭湖。',
    image: 'hequshazhouniuerhu.jpg',
    labels: [
      { text: '河曲沙洲', lon: -65.0396, lat: -14.1558, height: 400 },
      { text: '牛轭湖', lon: -65.023, lat: -14.1546, height: 350 },
    ],
    camera: { lon: -65.0316548757598, lat: -14.18909371502831, height: 2318.685857112999, heading: 6.183650867888191, pitch: -0.5431670431880904, roll: 0 },
  },
  {
    id: 'river-meander-steep-bank', name: '陡岸河曲沙洲', type: 'river',
    summary: '凹岸侵蚀、凸岸堆积，河曲发育的典型河段。',
    image: 'hequshazhoudouan.jpg',
    labels: [
      { text: '河曲沙洲', lon: -96.7036, lat: 30.8386, height: 250 },
      { text: '陡岸', lon: -96.7038, lat: 30.838, height: 200 },
    ],
    camera: { lon: -96.70993870721817, lat: 30.84104362741692, height: 256.2628905814868, heading: 1.9802817824463972, pitch: -0.2932138487611271, roll: 6.280763839255664 },
  },
  {
    id: 'river-nile-delta', name: '尼罗河三角洲', type: 'river',
    summary: '河口泥沙堆积形成的扇形三角洲，沿海岸呈弧形展开。',
    image: 'niluohesanjiaozhou.jpg',
    labels: [{ text: '三角洲', lon: 31.16, lat: 30.86, height: 120000 }],
    camera: { lon: 30.765032380990554, lat: 30.424683888177437, height: 725878.8733701644, heading: 6.070387456453908, pitch: -1.5667818775157194, roll: 0 },
  },
  {
    id: 'river-amazon-delta', name: '亚马逊河三角洲', type: 'river',
    summary: '全球流量最大河流的河口，泥沙扩散形成的宽阔三角洲。',
    image: 'yamaxunhesanjiaozhou.jpg',
    labels: [{ text: '三角洲', lon: -50.2, lat: 0, height: 450000 }],
    camera: { lon: -49.89457375847397, lat: 0.5971349654081896, height: 734903.5753538671, heading: 3.3105954462233997, pitch: -1.4672054707227625, roll: 3.1411901907313364 },
  },
  // ---- 冰川地貌 ----
  {
    id: 'glacier-cirque', name: '冰斗与冰斗湖', type: 'glacier',
    summary: '冰川侵蚀形成的围椅状洼地，退冰后积水成冰斗湖。',
    image: 'bingdou.jpg',
    labels: [{ text: '冰斗', lon: -113.7452, lat: 48.8061, height: 3000 }],
    camera: { lon: -113.68131192716704, lat: 48.852925355423174, height: 8610.511189991601, heading: 3.9759742354781524, pitch: -0.8444195307962374, roll: 0.00030742437497988107 },
  },
  {
    id: 'glacier-arete-horn', name: '刃脊与角峰', type: 'glacier',
    summary: '相邻冰斗扩张侵蚀，残留锐利山脊（刃脊）与金字塔形山峰（角峰）。',
    image: 'jiaofeng.jpg',
    labels: [{ text: '刃脊|角峰', lon: -113.67960692700075, lat: 48.66163656631385, height: 10092.36456488024 }],
    camera: { lon: -113.67960692700075, lat: 48.66163656631385, height: 10092.36456488024, heading: 5.1285857639360835, pitch: -1.2501077525705755, roll: 6.28307845996693 },
  },
  {
    id: 'glacier-lateral-moraine', name: '侧碛', type: 'glacier',
    summary: '冰川两侧汇集堆积的冰碛物，沿谷坡呈垄状延伸。',
    image: 'cezhi.jpg',
    labels: [{ text: '侧碛', lon: 80.75667895726464, lat: 35.50520719530568, height: 5988.186552870413 }],
    camera: { lon: 80.75667895726464, lat: 35.50520719530568, height: 5988.186552870413, heading: 3.2446259910760515, pitch: -0.26896380301314515, roll: 0.000021026726332529222 },
  },
  {
    id: 'glacier-terminal-moraine', name: '终碛', type: 'glacier',
    summary: '冰川末端消融堆积的弧形冰碛垄，指示冰川到达的位置。',
    image: 'zhongzhi.jpg',
    labels: [{ text: '终碛', lon: -142.30893682903627, lat: 60.84662720420505, height: 1386.3106586090908 }],
    camera: { lon: -142.30893682903627, lat: 60.84662720420505, height: 1386.3106586090908, heading: 4.31025624312748, pitch: -0.10002236712787882, roll: 0.00005798363286402264 },
  },
  {
    id: 'glacier-drumlin', name: '鼓丘', type: 'glacier',
    summary: '冰川底部堆积的流线型丘陵，长轴指示冰川流动方向。',
    image: 'guqiu.jpg',
    labels: [{ text: '鼓丘', lon: -70.99011993644048, lat: 42.33357722762148, height: 200 }],
    camera: { lon: -70.99011993644048, lat: 42.33357722762148, height: 19.28882571156349, heading: 2.8674306198446753, pitch: -0.032596524513242464, roll: 0.000002366762592131977 },
  },
  {
    id: 'glacier-u-valley', name: 'U型谷', type: 'glacier',
    summary: '冰川刨蚀形成的槽形谷，谷底宽平、谷坡陡直。',
    image: 'uxinggu.jpg',
    labels: [{ text: 'U型谷', lon: -119.648, lat: 37.725, height: 3000 }],
    camera: { lon: -119.69781277424836, lat: 37.704700415236644, height: 3709.9136856806444, heading: 1.1690414226062469, pitch: -0.39305150079809104, roll: 0.00016347634877611483 },
  },
  {
    id: 'glacier-roche-moutonnee', name: '羊背石', type: 'glacier',
    summary: '冰川磨蚀的基岩小丘，迎冰面平缓、背冰面陡峭形似羊背。',
    image: 'yangbeishi.jpg',
    labels: [{ text: '羊背石', lon: -119.35, lat: 37.86, height: 3000 }],
    camera: { lon: -119.3595633449034, lat: 37.87387705384428, height: 2937.9280453365486, heading: 0.9106635538978196, pitch: -0.1745948127548811, roll: 6.283175775230984 },
  },
  // ---- 海岸地貌 ----
  {
    id: 'coastal-wave-cut-cliff', name: '海蚀崖', type: 'coastal',
    summary: '波浪长期侵蚀海岸形成的陡崖，崖前常发育海蚀平台。',
    image: 'haishiya.jpg',
    labels: [{ text: '海蚀崖', lon: -122.5, lat: 37.649, height: 200 }],
    camera: { lon: -122.49634370895643, lat: 37.64605157069545, height: 111.86387657032373, heading: 0.8144936270347598, pitch: -0.3730205522467178, roll: 0.0000039757386822714125 },
  },
  {
    id: 'coastal-haystack-rock', name: '火山石（海蚀柱）', type: 'coastal',
    summary: '美国俄勒冈海岸的 Haystack Rock，火山岩经海蚀残留的巨型海蚀柱。',
    image: 'HaystackRock.jpg',
    labels: [{ text: 'Haystack Rock', lon: -123.96814330540916, lat: 45.877259332552896, height: 516.9830654715098 }],
    camera: { lon: -123.96814330540916, lat: 45.877259332552896, height: 516.9830654715098, heading: 0.11618188804430396, pitch: -0.6465230665609489, roll: 0.00001872033903982384 },
  },
  {
    id: 'coastal-sea-arch', name: '海蚀拱（Cabo San Lucas）', type: 'coastal',
    summary: '墨西哥卡波圣卢卡斯的拱桥状海蚀地貌，波浪掏蚀穿孔而成。',
    image: 'haishigong.jpg',
    labels: [{ text: '海蚀拱', lon: -109.9, lat: 22.86, height: 200 }],
    camera: { lon: -109.9, lat: 22.86, height: 111.86387657032373, heading: 16.7, pitch: -21.97, roll: 0 },
  },
  {
    id: 'coastal-beach', name: '海滩', type: 'coastal',
    summary: '澳大利亚黄金海岸，波浪搬运堆积形成的沙质海滩。',
    image: 'haitan.jpg',
    labels: [{ text: '澳大利亚黄金海岸', lon: 153.4273117128287, lat: -27.915152965376052, height: 2523.8752026386433 }],
    camera: { lon: 153.4273117128287, lat: -27.915152965376052, height: 2523.8752026386433, heading: 3.148390143286151, pitch: -1.4145491368216088, roll: 3.190705269997088 },
  },
  {
    id: 'coastal-spit', name: '沙嘴', type: 'coastal',
    summary: '立陶宛库尔斯沙嘴，沿岸流堆积形成的狭长沙堤，将潟湖与海隔开。',
    image: 'shazhui.jpg',
    labels: [{ text: '库尔斯沙嘴', lon: 20.902212849916566, lat: 55.509818653451894, height: 155076.79471840762 }],
    camera: { lon: 20.902212849916566, lat: 55.509818653451894, height: 155076.79471840762, heading: 2.9143315467338535, pitch: -1.4183723453369228, roll: 3.141929700447638 },
  },
  {
    id: 'coastal-mangrove', name: '红树林海岸', type: 'coastal',
    summary: '红树林消浪促淤形成的生物海岸，发育于热带淤泥质潮间带。',
    image: 'hongshulin.jpg',
    labels: [{ text: '红树林', lon: 114.00734454869014, lat: 22.525539348734863, height: 1263.4554604756052 }],
    camera: { lon: 114.00734454869014, lat: 22.525539348734863, height: 1263.4554604756052, heading: 0.48176925416975447, pitch: -1.5392903552545607, roll: 0 },
  },
  {
    id: 'coastal-coral-reef', name: '珊瑚礁海岸', type: 'coastal',
    summary: '澳大利亚大堡礁，珊瑚骨骼堆积营造的庞大生物礁海岸。',
    image: 'dabaojiao.jpg',
    labels: [{ text: '大堡礁', lon: 149.2166628739637, lat: -19.84367448533641, height: 622551.0488727009 }],
    camera: { lon: 149.2166628739637, lat: -19.84367448533641, height: 622551.0488727009, heading: 0.07047616663814615, pitch: -1.5698562981398503, roll: 0 },
  },
  {
    id: 'coastal-lagoon', name: '潟湖', type: 'coastal',
    summary: '台湾七股潟湖，沙嘴半封闭海湾形成的浅水水域。',
    image: 'xihu.jpg',
    labels: [{ text: '七股潟湖', lon: 120.07284436647798, lat: 23.12861036288368, height: 24761.047125613488 }],
    camera: { lon: 120.07284436647798, lat: 23.12861036288368, height: 24761.047125613488, heading: 0.5681248789833777, pitch: -1.560510446411174, roll: 0 },
  },
  // ---- 黄土地貌 ----
  {
    id: 'loess-yuan', name: '黄土塬', type: 'loess',
    summary: '黄土堆积的平坦高地，顶面广阔、周边沟谷深切。',
    image: 'huangtuyuan.jpg',
    labels: [{ text: '黄土塬', lon: 107.65, lat: 35.65, height: 3000 }],
    camera: { lon: 107.67129996959744, lat: 35.609383607017186, height: 2302.3726106315285, heading: 6.07722661761191, pitch: -0.351544926319983, roll: 0.00002853792219692508 },
  },
  {
    id: 'loess-liang', name: '黄土梁', type: 'loess',
    summary: '长条状延伸的黄土丘陵，多由塬面侵蚀分割而成。',
    image: 'huangtulian.jpg',
    labels: [{ text: '黄土梁', lon: 110.98, lat: 37.4, height: 3000 }],
    camera: { lon: 110.98864526694166, lat: 37.40130343488287, height: 7266.916860402036, heading: 3.5521236212156295, pitch: -1.450578905179425, roll: 0.000895929580156718 },
  },
  {
    id: 'loess-mao', name: '黄土峁', type: 'loess',
    summary: '孤立的穹状黄土丘陵，沟壑环绕，水土流失强烈。',
    image: 'huangtumao.jpg',
    labels: [{ text: '黄土峁', lon: 106.55692674436881, lat: 36.319975999066145, height: 3000 }],
    camera: { lon: 106.55692674436881, lat: 36.319975999066145, height: 1927.5771297381302, heading: 5.925887937108735, pitch: -0.17497599585557522, roll: 0.00004599011468009451 },
  },
  // ---- 灾害地貌 ----
  {
    id: 'catastrophic-hope-slide', name: 'Hope Slide（滑坡）', type: 'catastrophic',
    summary: '加拿大霍普大型滑坡遗迹，1965 年山体滑动掩埋山谷。',
    image: 'hopeslide.jpg',
    labels: [{ text: 'Hope Slide', lon: -121.264, lat: 49.301, height: 3000 }],
    camera: { lon: -121.31108617251196, lat: 49.31136195704758, height: 2827.7844639173345, heading: 1.65900072274471, pitch: -0.4080263291110702, roll: 0.00010929262844427967 },
  },
  {
    id: 'catastrophic-debris-flow', name: '泥石流', type: 'catastrophic',
    summary: '泥沙石块与水混合的灾害性流体，出口处形成堆积扇。',
    image: 'nishiliu.jpg',
    labels: [{ text: '泥石流', lon: -107.85930275788803, lat: 39.23009993092937, height: 4766.850709075933 }],
    camera: { lon: -107.85930275788803, lat: 39.23009993092937, height: 4766.850709075933, heading: 3.0938793203408297, pitch: -0.5033604736892574, roll: 6.283155787682183 },
  },
  {
    id: 'catastrophic-rockfall', name: '崩塌', type: 'catastrophic',
    summary: '陡坡岩体突然崩落堆积的灾害地貌，坡脚形成倒石堆。',
    image: 'bengta.jpg',
    labels: [{ text: '崩塌', lon: -44.125152860426574, lat: -20.175254589137875, height: 10607.890644574225 }],
    camera: { lon: -44.125152860426574, lat: -20.175254589137875, height: 10607.890644574225, heading: 6.283185307179451, pitch: -1.1504480919412807, roll: 6.661338147750939e-14 },
  },
  // ---- 农业地貌 ----
  {
    id: 'agriculture-circle-farms', name: '圆形农田', type: 'agriculture',
    summary: '中枢喷灌系统形成的圆形田块，人类活动塑造的农业景观。',
    image: 'yuanxingnongtian.jpg',
    labels: [{ text: '圆形农田', lon: -106.04718842842587, lat: 37.70555788176232, height: 94688.66388082838 }],
    camera: { lon: -106.04718842842587, lat: 37.70555788176232, height: 94688.66388082838, heading: 6.238376573734677, pitch: -1.5550131909734732, roll: 0 },
  },
  {
    id: 'agriculture-terrace', name: '梯田', type: 'agriculture',
    summary: '人工修筑的台阶式农田，保水保土的坡地利用工程。',
    image: 'titian.jpg',
    labels: [{ text: '梯田', lon: 102.80292773710677, lat: 23.092119326763257, height: 3077.5487276482404 }],
    camera: { lon: 102.80292773710677, lat: 23.092119326763257, height: 3077.5487276482404, heading: 3.7628720321796916, pitch: -1.35882671712975, roll: 6.283171146641826 },
  },
];
