/**
 * 供应商数据导入脚本
 * 从购销合同中提取的供应商信息
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const suppliers = [
  {
    "filename": "购销合同 CG2500001.docx",
    "name": "佛山市振粤陶陶瓷有限公司",
    "taxId": "91440604MA56L7TE45",
    "address": "佛山市禅城区石湾镇街道沙岗新路228号华达建材城2号楼309-3(住所申报)",
    "bankName": "佛山农村商业银行股份有限公司东村支行（南庄支行）",
    "bankAccount": "80020000016676517",
    "phone": "13929958027"
  },
  {
    "filename": "购销合同 CG2500004 密胺餐盘.docx",
    "name": "上海鑫诺密胺制品有限公司",
    "taxId": "9131011206376389X3",
    "address": "上海市闵行区吴中路638号2幢106室",
    "bankName": "工行上海市金虹桥支行"
  },
  {
    "filename": "购销合同 CG2500002  铁门.docx",
    "name": "福建裕豪门业有限公司",
    "taxId": "91350602337645883D",
    "address": "福建省漳州市芗城区石亭镇仙景村工业小区漳华路白牌路",
    "bankName": "招商银行股份有限公司漳州分行",
    "bankAccount": "596900216310101",
    "phone": "15860606085"
  },
  {
    "filename": "购销合同CG2600008-接油盘-米尔皮塔.docx",
    "name": "佛山市顺德区盈顺澳电器实业有限公司",
    "taxId": "91440606673146805K",
    "address": "广东省佛山市顺德区容桂街道南区社区达盛路33号1栋(住所申报)",
    "bankName": "中国银行顺德小黄圃支行",
    "bankAccount": "735478167792",
    "phone": "0757-28387673"
  },
  {
    "filename": "购销合同CG2600001-吊灯-圣荷西625.docx",
    "name": "中山市赶灯荟灯饰有限公司",
    "taxId": "91442000MAEEYWKPXM",
    "address": "广东省中山市古镇镇七坊村岐江路北一巷5号",
    "bankName": "中国工商银行中山古镇利和支行",
    "bankAccount": "2011059009100408789",
    "phone": "0760-22383785"
  },
  {
    "filename": "购销合同CG2600004-竹蒸笼-圣荷西2115.docx",
    "name": "佛山市顺德区粤兴强竹篮厂",
    "taxId": "92440606MA56WQU40N",
    "address": "佛山市顺德区北滘镇三桂村关帝庙边地6号之二(住所申报)",
    "bankName": "中国农业银行",
    "bankAccount": "44478601040004879",
    "phone": "15920853026"
  },
  {
    "filename": "购销合同CG2600005-落地式烤网清洗机-圣荷西2115.docx",
    "name": "威海品牛烧烤设备有限公司",
    "taxId": "91371000052350125D",
    "address": "威海临港经济技术开发区苘山镇杨家卧龙村东",
    "bankName": "中国工商银行威海分行营业部",
    "bankAccount": "1614028209024840513",
    "phone": "15650135205"
  },
  {
    "filename": "购销合同CG2600006-陶瓷餐具-圣荷西2115和Burbank.docx",
    "name": "潮州市陶云瓷业有限公司",
    "taxId": "91445100MACBJX627J",
    "address": "潮州市枫溪区山边村中村门口前南东9号厂房",
    "bankName": "中国建设银行股份有限公司潮州市分行",
    "bankAccount": "44050180869900003466",
    "phone": "18923519803"
  },
  {
    "filename": "购销合同CG2600002-烤盘-圣荷西2115.docx",
    "name": "安平县天和金属网业有限公司",
    "taxId": "91131125665280684Q",
    "address": "安平县西两洼乡耿官屯村村西70米处",
    "bankName": "中国建设银行安平支行",
    "bankAccount": "13050171770800005347",
    "phone": "18103388666"
  },
  {
    "filename": "购销合同CG2500078- 椅子-Burbank和圣荷西625和红木城.docx",
    "name": "廊坊秀儿商贸有限公司",
    "taxId": "91131081MA09286E0H",
    "address": "河北省廊坊市霸州市胜芳镇北环路律环律环路29号",
    "bankName": "河北霸州农村商业银行股份有限公司银行胜芳支行",
    "bankAccount": "336700122000073261",
    "phone": "17331637171"
  },
  {
    "filename": "购销合同CG2500079- 脚架-Burbank.docx",
    "name": "广东红泰阳家具有限公司",
    "taxId": "91440605MA56D6LA40",
    "address": "佛山市南海区九江镇沙头英明忠义村工业大道二路马锦标综合楼首层3号",
    "bankName": "：中国银行",
    "bankAccount": "688674540655",
    "phone": "18925983345"
  },
  {
    "filename": "购销合同CG2500071- 大理石桌面-圣荷西 2115.docx",
    "name": "云浮市锦德石业有限公司",
    "taxId": "914453000599198048",
    "address": "云浮市云城区思劳镇城村村委榃满村",
    "bankName": "农行云浮市河口支行",
    "bankAccount": "44668301040003589",
    "phone": "13929958027"
  },
  {
    "filename": "购销合同CG2500073-餐边柜-圣荷西2115.docx",
    "name": "泉州市艾森家居用品有限公司",
    "taxId": "91350524MA32TRT273",
    "address": "福建省泉州市安溪县魁斗镇大岭工业区",
    "bankName": "兴业银行股份有限公司安溪支行",
    "bankAccount": "153300100100205097",
    "phone": "15375798966"
  },
  {
    "filename": "购销合同CG2500072-石材-圣荷西2115.docx",
    "name": "泉州市新兴石材工艺有限公司",
    "taxId": "9135058361154260X0",
    "address": "福建南安市石井镇院下工业区",
    "bankName": "中国工商银行南安市石井支行",
    "bankAccount": "1408014509007000377",
    "phone": "0595-86088468"
  },
  {
    "filename": "购销合同CG2500074-搅拌机-圣荷西2115.docx",
    "name": "禹城祥牧农牧机械有限公司",
    "taxId": "91371482MA3P45UJ74",
    "address": "山东省禹城市十里望南营村禹城祥牧农牧机械有限公司",
    "bankName": "中国农业银行禹城支行",
    "bankAccount": "15785101040021500",
    "phone": "13653050728"
  },
  {
    "filename": "购销合同CG2500076- 餐盘-圣荷西2115.docx",
    "name": "上海宗介酒店设备用品有限公司",
    "taxId": "91310120MA1HT44C74",
    "address": "上海市奉贤区南桥镇环城西路477号1层",
    "bankName": "中国工商银行股份有限公司上海岚皋路支行",
    "bankAccount": "1001307309100026433",
    "phone": "13321858501"
  },
  {
    "filename": "购销合同CG2500077- 铁艺屏风-安纳汉姆.docx",
    "name": "福建泉州鼎联工艺品有限公司",
    "taxId": "91350524MA33WK5W8G",
    "address": "福建省泉州市安溪县凤城镇吾都村公路上166-1号",
    "bankName": "福建安溪农村商业银行股份有限公司",
    "bankAccount": "9070910010010000140820",
    "phone": "18859685836"
  },
  {
    "filename": "购销合同CG2500090- 仿真绿植花墙-安纳汉姆.docx",
    "name": "福建源茂文化创意有限公司",
    "taxId": "91350206MA8TEWFJ2R",
    "address": "福建省厦门市思明区湖滨南路258号鸿翔大厦706",
    "bankName": "平安银行厦门分行营业部",
    "bankAccount": "15384314910002",
    "phone": "13696959955"
  },
  {
    "filename": "购销合同CG2500089- 烧烤网-禧瑞都.docx",
    "name": "安平县隆曦五金丝网制品厂",
    "taxId": "92131125MA08XRK64P",
    "bankName": "中国工商银行开户支行",
    "bankAccount": "0407001109300380602",
    "phone": "0318-7660886"
  },
  {
    "filename": "购销合同CG2500084-焊机-圣荷西和Burbank.docx",
    "name": "常州大汉焊接设备有限公司",
    "taxId": "913204115643234898",
    "address": "常州市新北区黄河东路88号9幢-17号",
    "bankName": "工商银行股份有限公司常州天宁支行营业室",
    "bankAccount": "1105021109000295557",
    "phone": "18912326569"
  },
  {
    "filename": "购销合同CG2500080- 瓷砖-圣荷西2115.docx",
    "name": "佛山市企顺建材有限公司",
    "taxId": "91440604MACFPPBD39",
    "address": "佛山市禅城区石湾镇街道沙岗新路228号华达建材城2号楼309-3(住所申报)",
    "bankName": "中国建设银行",
    "bankAccount": "44050166895900001207",
    "phone": "13929958027"
  },
  {
    "filename": "购销合同CG2500094-酒架-米尔皮塔.docx",
    "name": "福建省安溪德荣家居用品有限公司",
    "taxId": "913505243374800702",
    "address": "福建省泉州市安溪县西坪镇西坪村割边12号",
    "bankName": "中国农业银行",
    "bankAccount": "13560601040001817",
    "phone": "18159507063"
  },
  {
    "filename": "购销合同CG2500095- 酒架和餐边柜-圣荷西.docx",
    "name": "上海雅称广告装潢设计有限公司",
    "taxId": "91310117MADWLG1042",
    "address": "上海市市辖区青浦区公园东路1640号401、402室，1642-1646号，1648、1650号",
    "bankName": "泰隆银行上海青浦支行",
    "bankAccount": "31010060201000087323",
    "phone": "15800822967"
  },
  {
    "filename": "购销合同CG2500083-燃气煮面炉连柜座-圣荷西和Burbank.docx",
    "name": "广州市多美仕厨房设备制造有限公司",
    "taxId": "91440111MAD7HXJR10",
    "address": "广州市天河区龙湖路1号之一102铺",
    "bankName": "广发银行广州龙洞支行",
    "phone": "13433966914"
  },
  {
    "filename": "购销合同CG2500096- 金属蜂窝板-圣荷西和Burbank.docx",
    "name": "广州高邦装饰材料有限公司",
    "taxId": "91440101MA5CJJLE01",
    "address": "广州市白云区钟落潭镇大岗领龙和路24号101",
    "bankName": "中国建设银行支行",
    "bankAccount": "44050156004100002075",
    "phone": "13480622923"
  },
  {
    "filename": "购销合同CG2500097- 亚克力光面乳白板-安纳汉姆.docx",
    "name": "深圳市亿扬塑业有限公司",
    "taxId": "91440300MADPPTF71T",
    "address": "深圳市罗湖区黄贝街道凤凰社区深南东路1122号华裕花园16B",
    "bankName": "平安银行深圳罗湖支行",
    "bankAccount": "15974889240052",
    "phone": "13794067003"
  },
  {
    "filename": "购销合同 CG2500093-火锅台石英石-圣荷西625店和红木城旧店(1).docx",
    "name": "云浮市贝洛斯石英石有限公司",
    "taxId": "91445302MA4WBT5A6P",
    "address": "云浮市云城区腰古镇芙蓉村委高龙围(云浮市铭洪石材有限公司侧)",
    "bankName": "中国农业银行云浮市分行",
    "phone": "0766-8536339"
  },
  {
    "filename": "购销合同CG2500085- LED显示屏-米尔皮塔.docx",
    "name": "深圳鑫光汇光电科技有限公司",
    "taxId": "91440300MA5FFMB95A",
    "address": "深圳市宝安区石岩街道塘头社区塘头社区第三工业区D区第二栋二层",
    "bankName": "中国银行股份有限公司深圳华南城支行",
    "bankAccount": "748471716585",
    "phone": "0755-28267864"
  },
  {
    "filename": "购销合同 CG2400028  嘉米陶瓷砖.docx",
    "name": "佛山市嘉米陶建材有限公司",
    "taxId": "91440604081080339C",
    "address": "佛山市禅城区南庄镇溶州井深工业区自编33号",
    "bankName": "中国工商银行佛山市分行和平支行",
    "bankAccount": "2013025509200029920",
    "phone": "13929958027"
  },
  {
    "filename": "购销合同 CG2400015 灏合传送带.docx",
    "name": "广州市灏合食品机械有限公司",
    "address": "广州市番禺区石基镇石基村金井坊东大街 13 号之三房",
    "bankName": "平安银行广州番禺支行",
    "bankAccount": "15803730430021"
  },
  {
    "filename": "购销合同 CG2400014 玻璃瓶.docx",
    "name": "徐州飞翔玻璃制品有限公司",
    "address": "徐州铜山区马坡镇玻璃工业园",
    "bankName": "莱商银行股份有限公司徐州泉山支行",
    "phone": "15262036073"
  },
  {
    "filename": "购销合同 CG2400017 传送带.docx",
    "name": "广州航迪机械设备有限公司",
    "taxId": "914401110746239809",
    "address": "广州白云区龙归龙河西路28号",
    "bankName": "中国工商银行大德路支行",
    "phone": "13660026701"
  },
  {
    "filename": "购销合同 CG2400020  瓷砖.docx",
    "name": "佛山市南海区奥亚建材有限公司",
    "taxId": "91440605692454352K",
    "address": "佛山市南海区小塘新境奇石开发区上下格岗厂房",
    "bankName": "中国工商银行佛山小塘支行",
    "bankAccount": "2013024109200042179",
    "phone": "13929958027"
  },
  {
    "filename": "购销合同 CG2500011 雾化壁炉.docx",
    "name": "瑞安俊轩科技有限公司",
    "taxId": "91440101MA5AKT1E4X",
    "address": "浙江省温州市瑞安市云周街道根桥村173号第一层",
    "bankName": "中国农业银行股份有限公司瑞安飞云支行",
    "bankAccount": "19246201040018580",
    "phone": "15858856918"
  },
  {
    "filename": "购销合同CG2500117-窗帘-米尔皮塔.docx",
    "name": "广东东纳窗帘有限公司",
    "taxId": "91440111596198854K",
    "address": "佛山市南海区西樵镇崇民路崇南旧村委永恒厂1号",
    "bankName": "中国银行广州盈嘉花园支行",
    "bankAccount": "731558819283",
    "phone": "16624608028"
  },
  {
    "filename": "购销合同CG2500101-不锈钢桶-圣荷西2115.docx",
    "name": "潮州市富雅猴不锈钢有限公司",
    "taxId": "91445103MAELN69X0H",
    "address": "潮州市潮安区彩塘镇东里村东升五路2号",
    "bankName": "中国银行股份有限公司潮州潮安彩塘支行",
    "bankAccount": "645780304580",
    "phone": "645780304580"
  },
  {
    "filename": "购销合同CG2500105-不锈钢餐具-圣荷西2115.docx",
    "name": "揭阳市梓发五金有限公司",
    "taxId": "91445202MAEX2LA556",
    "address": "揭阳市榕城区梅云街道群英村群光路中段",
    "bankName": "中国建设银行股份有限公司揭阳仙桥支行",
    "bankAccount": "44050179020600001281",
    "phone": "13822946959"
  },
  {
    "filename": "购销合同CG2500100-陶瓷盘-圣荷西2115.docx",
    "name": "潮州市雅玉陶瓷有限公司",
    "taxId": "91445100618146271C",
    "address": "广东省潮州市枫溪区堤头村高园片",
    "bankName": "中国建设银行股份有限公司潮州厦利支行",
    "bankAccount": "44050180687700000011",
    "phone": "15521331833"
  },
  {
    "filename": "购销合同CG2500107-密胺餐具-圣荷西2115.docx",
    "name": "东莞市台德塑料制品有限公司",
    "taxId": "914419006924623280",
    "address": "广东省东莞市桥头镇东江村恒福路 5 号",
    "bankName": "中国农业银行东莞市桥头支行",
    "bankAccount": "44298001040019910",
    "phone": "0769-82362788"
  },
  {
    "filename": "购销合同CG2500116-不锈钢护栏-喜瑞都.docx",
    "name": "佛山市圣冠柏金属有限公司",
    "taxId": "914406043150576180",
    "address": "佛山市顺德区乐从镇大罗村大罗大道23号创智谷产业园6号楼1119号(住所申报)",
    "bankName": "佛山农村商业银行股份有限公司澜石支行",
    "bankAccount": "80020000006881302",
    "phone": "13336433733"
  },
  {
    "filename": "购销合同CG2500099-玻璃碗-圣荷西2115.docx",
    "name": "天津金易鑫商贸有限公司",
    "taxId": "91120116MA0774LN4T",
    "address": "天津市滨海高新区华苑产业区（环外）海泰南道28号C座1-401-1室",
    "bankName": "中国银行天津高新支行",
    "bankAccount": "276591835681",
    "phone": "022-23766756"
  },
  {
    "filename": "购销合同CG2500103-灯带-圣荷西2115.docx",
    "name": "中山市宸光灯火灯饰厂",
    "taxId": "92442000MA579XF15M",
    "address": "中山市古镇镇新兴大道东89号第六层",
    "bankName": "中国农业银行股份有限公司中山小榄白莲池支行",
    "bankAccount": "44316601040010757",
    "phone": "18318876576"
  },
  {
    "filename": "购销合同CG2500098-机柜-圣荷西2115.docx",
    "name": "相城区黄桥昇祥金属制品店",
    "taxId": "92320507MA1PNF569M",
    "address": "苏州相城区黄桥街道荷美名邸33栋502",
    "bankName": "农业银行苏州元和支行",
    "bankAccount": "10541101040020572",
    "phone": "13706132447"
  },
  {
    "filename": "购销合同CG2500104-餐具-圣荷西2115.docx",
    "name": "派跃升（广州）供应链有限公司",
    "taxId": "91440101MA59LTLH0M",
    "address": "广州市白云区松柏东街13号鸿丰商贸城A座4、5层自编B511室",
    "bankName": "中国建设银行股份有限公司广州花城支行",
    "bankAccount": "44050158010700004427",
    "phone": "19864351290"
  },
  {
    "filename": "购销合同CG2500115-灯带-米尔皮塔.docx",
    "name": "深圳市亿源生物科技有限公司",
    "taxId": "91440300MA5EF75448",
    "address": "深圳市龙岗区南湾街道丹竹头社区盛宝路29号熙源丰创意园A栋办公楼三层302",
    "bankName": "中国招商银行罗湖支行",
    "bankAccount": "755933719210601",
    "phone": "18688949882"
  },
  {
    "filename": "购销合同CG2500121-雾化壁炉-Sunnyvale.docx",
    "name": "中山市翼恒电器有限公司",
    "taxId": "91442000MACN14XF9J",
    "address": "广东中山市横栏镇富庆一路一号7楼",
    "bankName": "中山市中国建设银行股份有限公司古镇支行",
    "phone": "18676151527"
  },
  {
    "filename": "购销合同CG2500126-灯具-圣荷西2115.docx",
    "name": "中山市寰亚照明电器厂（个体工商户）",
    "taxId": "92442000MACKJMWUXT",
    "address": "广东中山小榄埒西一东帝公司4楼",
    "bankName": "中国建设银行股份有限公司中山海州支行",
    "bankAccount": "44050178200300002046",
    "phone": "18024205749"
  },
  {
    "filename": "购销合同CG2500123-满天星吊灯-圣荷西2115.docx",
    "name": "深圳市凯康光电科技有限公司",
    "address": "深圳市福田区福田街道岗厦社区彩田路3069号星世纪A栋2317D20",
    "bankName": "深圳北站支行",
    "phone": "13425521749"
  },
  {
    "filename": "购销合同CG2500127-吊灯-圣荷西2115.docx",
    "name": "中山市缘典灯饰有限公司",
    "taxId": "91442000MA55CHXE77",
    "address": "中山市古镇岗南工业区百佳15号楼",
    "bankName": "中国农业银行股份有限公司中山古镇支行",
    "bankAccount": "44318101040059985",
    "phone": "13532020064"
  },
  {
    "filename": "购销合同CG2500130-音响设备-米尔皮塔.docx",
    "name": "广州雅竹音响有限公司",
    "taxId": "91440101MA59KLWY2K",
    "address": "广州市白云区白云湖街唐阁新基头工业园B栋2楼",
    "bankName": "中国建设银行股份有限公司广州江高支行",
    "bankAccount": "44050149110400000474",
    "phone": "13662497577"
  },
  {
    "filename": "购销合同CG2500066- 隔断-禧瑞都.docx",
    "name": "佛山市南海区筑界空间门窗厂（个体工商户）",
    "taxId": "92440605MA4WETUR0J",
    "address": "佛山市南海区西樵镇百西村村头村新市场区35号",
    "bankName": "广东省南海农商银行西樵支行",
    "bankAccount": "80020000023315596",
    "phone": "13702605325"
  },
  {
    "filename": "购销合同CG2500054- 不锈钢工作台-圣荷西+安纳汉姆(1).docx",
    "name": "广州互利恒餐饮管理有限公司",
    "taxId": "91440101MA5CL48TOK",
    "address": "广州市白云区嘉禾街道新科下新村永和东街13号(主体二楼)",
    "bankName": "中国工商银行",
    "bankAccount": "3602091209200268569",
    "phone": "400-6858-665"
  },
  {
    "filename": "购销合同CG2500036-不锈钢火锅-禧瑞都.docx",
    "name": "潮州市彩塘永利五金厂",
    "taxId": "91445103X1811038XP",
    "address": "潮州市潮安区彩塘镇彩塘管区彩里路中段陈铺地段",
    "bankName": "中国银行潮州潮安支行",
    "bankAccount": "692557753995",
    "phone": "15816195969"
  },
  {
    "filename": "购销合同CG2500047-椅子-禧瑞都.docx",
    "name": "佛山市卡典五金制品有限公司",
    "taxId": "91440606MA4WEYDN3P",
    "address": "佛山市顺德区龙江镇龙山社区龙峰大道42号二座A区（住所申报）",
    "bankName": "中国建设银行股份有限公司顺德建龙支行",
    "bankAccount": "44050166737800000471",
    "phone": "13790003334"
  },
  {
    "filename": "购销合同CG2500049-包厢隔门-禧瑞都.docx",
    "name": "广州市格菱装饰工程有限公司",
    "address": "广州市白云区钟落潭广从八路757号",
    "bankName": "中国工商银行广州花都支行",
    "bankAccount": "3602026809200712285",
    "phone": "13286815682"
  },
  {
    "filename": "购销合同CG2500046-椅子-禧瑞都.docx",
    "name": "佛山市欧诗缇家具有限公司",
    "address": "佛山南海区英明村英明36工业楼",
    "bankName": "中国丁商银行佛山南海沙头支行",
    "bankAccount": "2013023909200074827",
    "phone": "13927284478"
  },
  {
    "filename": "购销合同CG2500034-旋风锅-禧瑞都.docx",
    "name": "佛山市顺德区小企鹅餐饮设备有限公司",
    "taxId": "91440606572372846Q",
    "address": "佛山市顺德区容桂街道容里昌富西路天富来工业城五期7栋4楼",
    "bankName": "中国农业银佛山顺德容桂支行",
    "bankAccount": "44492001040021076",
    "phone": "15099881308"
  },
  {
    "filename": "购销合同CG2500039-仿真植物花墙-禧瑞都.docx",
    "name": "广东合源景观工程有限公司",
    "taxId": "91441900MACU19GJ3C",
    "address": "广东省东莞市东城街道东城光明路13号1栋312室",
    "bankName": "中国工商银行股份有限公司东莞愉景支行",
    "bankAccount": "2010016309100198006",
    "phone": "18926863656"
  },
  {
    "filename": "购销合同 CG2500038-水晶屏风-禧瑞都.docx",
    "name": "佛山市铭源金属制品有限公司",
    "taxId": "91440606MABTMG6PXQ",
    "bankName": "中国农业银行股份有限公司佛山祖庙支行",
    "bankAccount": "44429001040011489"
  },
  {
    "filename": "购销合同CG2500044-玻璃马赛克-Burbank.docx",
    "name": "佛山市赛鑫建材有限公司",
    "address": ":佛山市禅城区河宕村委河南工业大道北侧 A 座二层 N3",
    "bankName": "佛山农村商业银行股份有限公司河宕支行",
    "phone": "0757-63827567"
  },
  {
    "filename": "购销合同CG2500068- 置物架 -安纳汉姆和Burbank.docx",
    "name": "中山市常胜金属制品有限公司",
    "taxId": "91442000752073253K",
    "address": "中山市三角镇金腾路19号A栋1-5楼",
    "bankName": "中山农村商业银行股份有限公司东凤同安支行",
    "bankAccount": "80020000000094386",
    "phone": "0760-22631160"
  },
  {
    "filename": "购销合同CG2500053- 平开玻璃门-圣荷西2115.docx",
    "name": "潍坊开祥自动门窗有限公司",
    "taxId": "91370724MA3CU2MX21",
    "address": "山东省潍坊市临朐县东城街道沂山路南侧",
    "bankName": "中国工商银行",
    "bankAccount": "1607055509200011555",
    "phone": "0536-3713111"
  },
  {
    "filename": "购销合同 CG2500058-切菜机-禧瑞都和圣荷西2115.docx",
    "name": "邢台市泽来鑫机械厂",
    "taxId": "911305260971511979",
    "address": "河北省邢台市任县天口镇东甄庄村",
    "bankName": "中国建设银行邢台市任县支行",
    "bankAccount": "13050165760800000801",
    "phone": "15832923885"
  },
  {
    "filename": "购销合同CG2500062-地膜-Burbank和圣荷西.docx",
    "name": "广州佳和环保建材有限公司",
    "taxId": "91440111MACGMLX278",
    "address": "广州市白云区尖彭路22号B栋307室",
    "bankName": "中国农业银行广州海印支行",
    "bankAccount": "44030601040021965",
    "phone": "13710084189"
  },
  {
    "filename": "购销合同 CG2500020 自助餐台.docx",
    "name": "广州布菲厨具制造有限公司",
    "taxId": "91440101MA59NYHY9A",
    "address": "广东省广州市番禺区钟村街钟一村飞鹅街21号之一",
    "bankName": "中国银行股份有限公司广州番禺钟村支行",
    "bankAccount": "632768923548",
    "phone": "020-31561360"
  }
];

async function main() {
  console.log('开始导入供应商数据...');
  
  let created = 0;
  let skipped = 0;
  
  for (const s of suppliers) {
    // 检查是否已存在（按名称）
    const existing = await prisma.supplier.findFirst({
      where: { name: s.name }
    });
    
    if (existing) {
      // 更新缺失的信息
      await prisma.supplier.update({
        where: { id: existing.id },
        data: {
          taxId: existing.taxId || s.taxId || null,
          address: existing.address || s.address || null,
          bankName: existing.bankName || s.bankName || null,
          bankAccount: existing.bankAccount || s.bankAccount || null,
          phone: existing.phone || s.phone || null,
        }
      });
      skipped++;
    } else {
      // 创建新供应商
      await prisma.supplier.create({
        data: {
          name: s.name,
          taxId: s.taxId || null,
          address: s.address || null,
          bankName: s.bankName || null,
          bankAccount: s.bankAccount || null,
          phone: s.phone || null,
        }
      });
      created++;
    }
  }
  
  console.log(`导入完成: 新增 ${created}, 更新 ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
