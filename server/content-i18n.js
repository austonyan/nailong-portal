// Built-in bilingual content for server-stored catalogs and notices.
//
// Rows created by administrators keep `*_tw` NULL until an admin fills them in;
// this module only backfills the rows that ship with the codebase. Matching is
// by stable code (`services`, `roles`, `*_types`, `im_ports`, `dip_offices`) or
// by the Simplified title for code-less notices. Backfills never overwrite a
// non-empty Traditional value.

const SERVICES = {
  wiki: { name: '奶龍圖鑑', description: '奶龍世界觀的百科與圖鑑' },
  workshop: { name: '禮物工坊', description: '給島上的朋友們準備禮物' },
  weather: { name: '島嶼天氣', description: '查看今天的島嶼天氣與流星雨預報' },
  visa: { name: '奶龍國簽註申請署', description: '辦理奶龍國旅遊簽註:申請、審核、簽發與驗真' },
  docs: { name: '奶龍國皇家文書與認證署', description: '認證邀請函、簽註證明、居民卡等文書:申請、審核、簽發、驗真' },
  immigration: { name: '皇家口岸入境署', description: '申報入境、領取通關碼、查看出入境記錄' },
  resident: { name: '奶龍國皇家居民登記署', description: '登記成為奶龍國居民,領取電子居民卡、辦理變更與驗真' },
  diplomacy: { name: '奶龍國皇家外交事務署', description: '虛構建交、外交身分登記、互免協議與外交驗真' },
  protocol: { name: '奶龍國皇家禮賓與活動署', description: '活動發布、報名審核、邀請函、活動憑證、接待方認證與禮賓服務' },
  appeal: { name: '奶龍國皇家申訴與監察署', description: '結果申訴、複核申請、投訴建議、工單客服與決定書驗真' },
};

const ROLES = {
  admin: { name: '管理員', description: '擁有全部權限的系統角色' },
  user: { name: '一般使用者', description: '預設角色,可存取入口網站、申請簽註與提交申訴' },
  visa_reviewer: { name: '簽註審核員', description: '審核簽註申請並簽發電子簽註(佇列隔離,不含入口網站管理)' },
  visa_admin: { name: '簽註管理員', description: '簽註審核與簽註配置管理' },
  appeal_processor: { name: '申訴處理員', description: '受理與處理申訴、投訴建議與工單(佇列隔離)' },
  appeal_reviewer: { name: '申訴複核員', description: '複核申訴處理決定(一次終局,佇列隔離)' },
  appeal_inspector: { name: '申訴監察員', description: '監察申訴處理時效與品質(唯讀,佇列隔離)' },
  appeal_admin: { name: '申訴署管理員', description: '申訴署全部權限:處理、複核、監察與管理' },
  docs_certifier: { name: '文書認證員', description: '審核文書認證申請並簽發電子文書(佇列隔離,不含入口網站管理)' },
  docs_admin: { name: '文書管理員', description: '文書審核與文書署配置管理' },
  imm_officer: { name: '邊檢員', description: '皇家口岸邊檢員:審核入境申報並核驗通關碼(佇列與簽註審核隔離)' },
  res_reviewer: { name: '居民審核員', description: '皇家居民登記署審核員:審核登記與變更申請(佇列隔離)' },
  res_admin: { name: '居民管理員', description: '皇家居民登記署管理員:居民卡管理與署內配置' },
  dip_reviewer: { name: '外交審核員', description: '皇家外交事務署審核員:僅處理建交與外交身分佇列(與簽註/邊檢/文書佇列隔離)' },
  dip_admin: { name: '外交管理員', description: '皇家外交事務署管理:類型配置、協議、代表處、禮遇、驗真與統計' },
  protocol_reviewer: { name: '活動審核員', description: '皇家禮賓與活動署審核員:僅處理報名、接待方與禮遇佇列(佇列隔離)' },
  protocol_checker: { name: '禮賓簽到員', description: '皇家禮賓與活動署簽到員:核銷活動憑證與簽到記錄' },
  protocol_admin: { name: '禮賓與活動署管理員', description: '活動發布、類型配置、邀請函/憑證、驗真、風控、統計與審計' },
};

export const CONTENT_PERMISSIONS = {
  'portal:access': { name: '入口網站存取', description: '登入後存取入口網站的基礎權限' },
  'users:read': { name: '使用者查看', description: '查看使用者清單與詳情' },
  'users:write': { name: '使用者管理', description: '建立、編輯、停用與刪除使用者' },
  'roles:read': { name: '角色查看', description: '查看角色與權限定義' },
  'roles:write': { name: '角色管理', description: '建立、編輯角色並分配權限' },
  'services:read': { name: '服務查看', description: '查看全部服務註冊資訊(含未啟用)' },
  'services:write': { name: '服務管理', description: '註冊、編輯、啟停與刪除服務' },
  'visa:apply': { name: '簽註申請', description: '提交與查看簽註申請' },
  'visa:review': { name: '簽註審核', description: '審核簽註申請、簽發與管理簽註' },
  'visa:manage': { name: '簽註管理', description: '管理簽註類型、公告、配置與風控' },
  'appeal:apply': { name: '申訴監察存取', description: '提交與查看申訴、複核、投訴建議與工單' },
  'appeal:process': { name: '申訴處理', description: '受理、分派、補件與處理決定;處理投訴建議與工單' },
  'appeal:review': { name: '申訴複核', description: '複核申訴處理決定(一次終局)' },
  'appeal:inspect': { name: '監察抽查', description: '監察申訴處理時效與品質(唯讀分析)' },
  'appeal:manage': { name: '申訴署管理', description: '公告、公示、範本、黑名單、配置、統計與審計' },
  'docs:apply': { name: '文書認證申請', description: '申請文書認證、管理材料與查看文書' },
  'docs:certify': { name: '文書認證審核', description: '在認證佇列中審核申請、簽發與駁回文書' },
  'docs:manage': { name: '文書管理', description: '管理文書類型、公告、驗真配置與風控' },
  'imm:portal': { name: '入境署存取', description: '使用皇家口岸入境署的申報、通關碼與記錄功能' },
  'imm:inspect': { name: '邊檢審核', description: '在邊檢工作台審核入境申報(僅入境佇列)' },
  'imm:verify': { name: '通關碼核驗', description: '查詢與核驗通關碼,人工通過或作廢' },
  'imm:admin': { name: '入境署管理', description: '口岸、公告、記錄、統計、範本與審計管理' },
  'res:portal': { name: '居民署存取', description: '使用皇家居民登記署的登記申請、居民卡與驗真功能' },
  'res:review': { name: '居民審核', description: '在居民審核工作台審核登記/變更/續期申請(僅居民佇列)' },
  'res:manage': { name: '居民署管理', description: '居民類型、公告範本、驗真、風控、統計與審計管理' },
  'dip:portal': { name: '外交署存取', description: '使用皇家外交事務署的建交、身分登記與驗真功能' },
  'dip:review': { name: '外交審核', description: '在審核工作台處理建交與外交身分佇列(佇列隔離)' },
  'dip:admin': { name: '外交署管理', description: '類型配置、協議、代表處、禮遇、驗真與統計管理' },
  'evt:portal': { name: '禮賓與活動署存取', description: '瀏覽活動、報名、邀請函、活動憑證與禮賓服務' },
  'evt:review': { name: '活動審核', description: '審核活動報名、接待方認證與禮遇申請(佇列隔離)' },
  'evt:checkin': { name: '活動簽到', description: '核銷活動憑證、處理簽到與簽退記錄' },
  'evt:manage': { name: '禮賓與活動署管理', description: '活動發布、類型配置、邀請函/憑證、驗真、風控、統計與審計' },
  'arch:portal': { name: '檔案署存取', description: '查詢本人簽註與入境檔案、匯出檔案彙總並提交資料刪除申請' },
  'arch:manage': { name: '檔案署管理', description: '歸檔規則設定、全量檔案查詢與匯出、刪除申請處理、存取日誌與稽核' },
  'post:portal': { name: '郵政署存取', description: '使用皇家郵政與通信署的訊息中心、公告訂閱與虛擬明信片' },
  'post:manage': { name: '郵政署管理', description: '公告、通知範本、明信片與統計稽核管理' },
  'tour:portal': { name: '文化旅遊署存取', description: '瀏覽景點與文化內容、參與打卡、收集紀念章與徽章' },
  'tour:manage': { name: '文化旅遊署管理', description: '景點、文化內容、打卡規則、徽章、統計與稽核管理' },
  'stat:portal': { name: '統計署存取', description: '檢視平台趣味統計並產生自己的年度報告' },
  'stat:manage': { name: '統計署管理', description: '平台總看板、統計口徑管理、資料匯出與稽核檢視' },
  'edu:portal': { name: '教育與科學署訪問', description: '瀏覽百科詞條、科普文章與學習任務' },
  'edu:review': { name: '內容審核', description: '審核百科詞條與科普文章的發布申請(僅審核佇列,不含內容管理)' },
  'edu:manage': { name: '教育與科學署管理', description: '詞條、文章、任務、統計與稽核管理' },
};

const VISA_TYPES = {
  TOURIST: {
    name: '旅遊簽註',
    description: '來奶龍國觀光、度假、打卡奶龍雕像的最經典簽註',
    guide: '適用於以觀光遊覽為目的進入奶龍國的旅行者。單次停留最長 30 天,簽發後 90 天內有效,不可續簽。需準備:頭像照片、行程說明;邀請函為選填。',
  },
  FAMILY: { name: '探親簽註', description: '探望在奶龍國定居的親友' },
  EVENT: { name: '活動簽註', description: '參加奶龍節、演唱會等活動' },
  DIPLOMATIC: { name: '外交簽註', description: '僅限各國奶龍友好使團' },
};

const DOC_TYPES = {
  VISA_CERT: {
    name: '簽註證明認證',
    description: '對奶龍國簽註申請署簽發的電子簽註出具認證證明',
    guide: '用途:為已簽發的電子簽註出具紙質感的認證證明,可用於展示與收藏。需要材料:簽註詳情頁截圖;身分說明選填。關聯業務:填寫簽註編號(如 NLT-260101-XXXXXX)。認證後 180 天內有效。',
    biz_no_label: '簽註編號',
  },
  INVITE: {
    name: '邀請函認證',
    description: '認證奶龍國居民或機構發出的邀請函',
    guide: '用途:驗證邀請函真實性,常用於活動報名與入境申報輔助。需要材料:邀請函掃描件;身分說明選填。關聯業務:填寫邀請函編號(由禮賓與活動署簽發,已與本署即時聯動校驗)。認證後 180 天內有效。',
    biz_no_label: '邀請函編號',
  },
  ENTRY_CERT: {
    name: '入境記錄證明',
    description: '為入境署受理的入境申報出具記錄證明',
    guide: '用途:證明某次入境申報真實存在,用於回溯行程。需要材料:入境申報回執截圖。關聯業務:填寫申報編號(由入境署產生,已與本署即時聯動校驗)。認證後 90 天內有效。',
    biz_no_label: '申報編號',
  },
  RESIDENT_CARD: {
    name: '居民卡認證',
    description: '對居民登記署登記的居民身分出具認證文書',
    guide: '用途:為居民編號出具認證文書,是最常用的身分類娛樂文書。需要材料:居民登記頁截圖;頭像照片選填。關聯業務:填寫居民編號(由居民登記署產生,已與本署即時聯動校驗)。認證後 365 天內有效。',
    biz_no_label: '居民編號',
  },
  EVENT_PASS: {
    name: '活動憑證認證',
    description: '認證活動參與憑證,如奶龍節、演唱會的參與證明',
    guide: '用途:為活動憑證背書,可用於收藏或下次活動的快速報名。需要材料:活動憑證截圖(門票、參與碼等)。關聯業務:填寫活動編號(由禮賓與活動署產生,已與本署即時聯動校驗)。認證後 90 天內有效。',
    biz_no_label: '活動編號',
  },
  DIPLOMATIC: {
    name: '外交文書認證',
    description: '認證外交事務署往來文書與建交文件',
    guide: '用途:認證使團往來文書、建交紀念文件。需要材料:外交文書掃描件。關聯業務:填寫外交編號(由外交事務署產生,已與本署即時聯動校驗)。認證後 365 天內有效。僅限使團管道提交。',
    biz_no_label: '外交編號',
  },
  APPEAL_DECISION: {
    name: '申訴決定書認證',
    description: '對皇家申訴與監察署出具的決定書進行背書認證',
    guide: '用途:為申訴/複核決定書出具認證文書,可用於展示、收藏或作為後續申訴的佐證。需要材料:決定書截圖;關聯業務:填寫決定書編號(如 NAD-…),系統會即時校驗歸屬與有效性。認證後 365 天內有效。',
    biz_no_label: '決定書編號',
  },
};

const IM_PORTS = {
  ROYAL_PORT: {
    name: '皇家口岸',
    open_hours: '每日 09:00 - 21:00(奶龍時間)',
    notice: '通關請攜帶你的趣味簽註與奶龍周邊;禁止攜帶現實世界的煩惱入境。',
    map_desc: '主樓(蓋章大廳)→ 長頸鹿滑梯查驗區 → 奶龍雕像合影廣場 → 出站花園。全程步行約 5 分鐘。',
  },
};

const IM_CHANNELS = {
  普通通道: { name: '普通通道', description: '隨到隨走,適合首次上島的旅客。' },
  预约通道: { name: '預約通道', description: '分時段預約,錯峰通關(即將開放)。' },
  特殊通道: { name: '特殊通道', description: '超大號奶龍玩偶攜帶者專用。' },
  '居民与外交礼遇通道': { name: '居民與外交禮遇通道', description: '持有效電子居民卡或外交身分卡可走此通道,出示電子憑證即可。' },
};

const RES_TYPES = {
  TEMPORARY: {
    name: '臨時居民',
    description: '剛登上奶龍島的新朋友,先以臨時居民的身分開始島上生活',
    guide: '登記條件:年滿 0 歲的奶龍愛好者;所需資訊:暱稱、聯絡方式、奶龍國虛構地址(選填)、個人簡介;登記材料:頭像(必傳)、地址證明(選填,趣味化即可);審核時長:預計 72 小時。',
    benefits: '專屬居民公告推送;居民編號驗真;未來可享簽註快捷通道、入境居民通道與活動優先報名(陸續開放)。',
    duties: '遵守《奶龍島居民友好公約》:不投餵過量零食、見到奶龍要打招呼、保持快樂。',
  },
  PERMANENT: {
    name: '永久居民',
    description: '在島上定居的長期居民,權益更多',
    benefits: '包含臨時居民全部權益,另享永久居民專屬稱號與活動禮遇。',
    duties: '守護奶龍島的環境與快樂氛圍。',
  },
  HONORARY: {
    name: '榮譽居民',
    description: '對奶龍島有特殊貢獻的貴賓',
    benefits: '包含永久居民全部權益,另享榮譽徽章與外交禮遇(規劃中)。',
    duties: '繼續熱愛奶龍。',
  },
};

const DIP_OBJECT_TYPES = {
  VIRTUAL_NATION: {
    name: '虛構國家',
    description: '擁有世界觀、領土設定與國民的虛構國度',
    guide: '適用於擁有完整世界觀設定的虛構國家:需提供國名、簡介(虛構介紹)與建交理由。建交後可在有效期內核驗外交身分並享受虛擬禮遇。範例公報:奶龍國與貴國本著趣味與友誼,決定自即日起互相承認並建立虛構外交關係。',
  },
  CITY_STATE: { name: '虛構城邦', description: '以城市為主體的虛構政權', guide: '城邦建交指南(即將開放)。' },
  FAN_COMMUNITY: { name: '粉絲社群', description: '圍繞奶龍的粉絲社群與後援會', guide: '粉絲社群建交指南(即將開放)。' },
  VIRTUAL_ORG: { name: '虛擬組織', description: '虛構國際組織、聯盟與協會', guide: '虛擬組織建交指南(即將開放)。' },
  EVENT_GROUP: { name: '活動團體', description: '短期活動組成的臨時團體', guide: '活動團體建交指南(即將開放)。' },
};

const DIP_RELATION_TYPES = {
  FORMAL: {
    name: '正式建交',
    description: '完整的虛構外交關係,可登記外交身分',
    guide: '正式建交為最高規格的虛構關係:適用於長期世界觀合作,有效期 365 天,可登記使節身分並申請外交簽註通道。',
  },
  FRIENDLY: { name: '友好關係', description: '輕量的友好合作關係' },
  OBSERVER: { name: '觀察員關係', description: '僅觀察與列席的預備關係' },
};

const DIP_IDENTITY_TYPES = {
  ENVOY: {
    name: '虛擬使節',
    description: '代表建交實體的駐奶龍國使節',
    guide: '虛擬使節為建交實體派駐奶龍國的最高虛構代表:需關聯一條已建交關係,提交虛構任命書,任期最長 365 天。',
  },
  DIPLOMAT: { name: '外交官', description: '使團中的外交官成員' },
  HONORARY_CONSUL: { name: '榮譽領事', description: '榮譽性質的虛構領事' },
  FOREIGN_GUEST: { name: '外賓', description: '受奶龍國邀請的虛構外賓' },
  OBSERVER: { name: '觀察員', description: '列席觀察的預備身分' },
};

const DIP_COURTESY_TYPES = {
  ENTRY_LANE: { name: '入境禮遇通道', description: '入境署通關時的趣味禮遇通道(與入境署聯動)' },
  EVENT_INVITE: { name: '活動優先邀請', description: '禮賓活動的優先邀請資格' },
  PRIORITY_REVIEW: { name: '優先審核', description: '署內申請優先審核(趣味化標記)' },
};

const DIP_OFFICES = {
  OFC_CENTRAL: {
    name: '中央大街代表處',
    location: '奶龍島中央大街 1 號(虛構)',
    open_hours: '每週二至週日 10:00 - 18:00',
    intro: '皇家外交事務署首個虛構代表處,負責接待各建交實體使團與趣味文件遞交。',
    contact: '虛構信箱:central@dip.nailong(不存在的地址)',
    services: '建交諮詢、外交身分材料預審、互免協議公示查閱',
  },
  OFC_HARBOR: {
    name: '海港使團樓',
    location: '奶龍島南港碼頭(虛構)',
    open_hours: '每週六 13:00 - 17:00',
    intro: '鄰近皇家口岸,方便使團通關後順路辦理外交手續。樓頂有巨型奶龍氣球。',
    contact: '虛構信箱:harbor@dip.nailong(不存在的地址)',
    services: '使團接待、活動邀請登記',
  },
};

const PRO_EVENT_TYPES = {
  CULTURE: { name: '文化交流', description: '故事會、語言角與虛構文化沙龍', guide: '文化交流活動歡迎所有島民:填寫暱稱與聯絡方式即可報名,最多可攜帶 2 位隨行夥伴。' },
  FESTIVAL: { name: '慶典', description: '奶龍節巡遊、煙花與島上慶典', guide: '慶典人流量較大,報名後請留意活動公告與變更通知。' },
  EXHIBITION: { name: '展覽', description: '虛構手作、繪畫與島嶼記憶展', guide: '展覽類活動可能需要上傳介紹信或過往參與憑證,以活動詳情為準。' },
  COMMUNITY: { name: '社群活動', description: '鄰里共創、花園維護與社群茶會', guide: '社群活動面向所有註冊使用者,歡迎帶上鄰居一起參加。' },
  DIPLOMATIC: { name: '外交活動', description: '使團聯誼、外交禮遇與接待儀式', guide: '外交活動僅限已完成外交身分登記的來賓報名,報名時需填寫外交身分編號。' },
  RESIDENT: { name: '居民專屬', description: '僅面向奶龍國居民開放的專屬活動', guide: '居民專屬活動需填寫居民編號,並與居民登記署校驗通過後方可報名。' },
};

const PRO_COURTESY_TYPES = {
  foreign_reception: { name: '外賓接待', description: '為虛構外賓提供的接待禮遇(趣味記錄)', requirements: '外賓需提供有效邀請函編號,或外交身分編號。' },
  resident_courtesy: { name: '居民禮遇', description: '面向奶龍國居民的虛構禮遇', requirements: '需提供有效的居民編號,並與居民登記署即時聯動校驗。' },
  diplomatic_courtesy: { name: '外交禮遇', description: '面向虛構外交身分的禮遇', requirements: '需提供有效外交身分編號,並處於有效期內。' },
  event_channel: { name: '活動禮賓通道', description: '活動入場的虛構禮賓通道', requirements: '需提供有效邀請函編號或活動憑證編號。' },
};

const DOC_TYPE_FIELDS = {
  VISA_CERT: {
    fields: { visit_note: { label: '行程補充說明', placeholder: '選填,一句話描述這次旅行' } },
    materials: { proof: { label: '簽註詳情截圖' } },
  },
  INVITE: {
    fields: {
      inviter_name: { label: '邀請人', placeholder: '邀請你的居民或機構名稱' },
      occasion: { label: '邀請事由', placeholder: '例如:奶龍節開幕式' },
    },
    materials: { main: { label: '邀請函掃描件' } },
  },
  ENTRY_CERT: {
    fields: { entry_port: { label: '入境口岸', placeholder: '例如:貝殼灣口岸' } },
    materials: { proof: { label: '入境申報回執截圖' } },
  },
  RESIDENT_CARD: {
    fields: { district: { label: '居住街區', placeholder: '例如:南瓜街' } },
    materials: { proof: { label: '居民登記頁截圖' }, avatar: { label: '頭像照片' } },
  },
  EVENT_PASS: {
    fields: { event_name: { label: '活動名稱', placeholder: '例如:奶龍節·星火之夜' } },
    materials: { voucher: { label: '活動憑證截圖' } },
  },
  DIPLOMATIC: {
    fields: { mission: { label: '使團名稱', placeholder: '例如:南瓜使團' } },
    materials: { doc: { label: '外交文書掃描件' } },
  },
  APPEAL_DECISION: {
    fields: { case_note: { label: '案件補充說明', placeholder: '選填,一句話描述這份決定書' } },
    materials: { proof: { label: '決定書截圖' } },
  },
};

function backfillDocTypeNested(db, rows) {
  const select = db.prepare('SELECT id, form_fields, materials FROM doc_types WHERE code = ?');
  const update = db.prepare('UPDATE doc_types SET form_fields = ?, materials = ? WHERE id = ?');
  let changed = 0;
  for (const [code, values] of Object.entries(rows)) {
    const row = select.get(code);
    if (!row) continue;
    let dirty = false;
    const addTw = (list, map) => {
      if (!Array.isArray(list)) return list;
      for (const item of list) {
        const tw = map[item.key];
        if (!tw) continue;
        if (!item.labelTw && tw.label) {
          item.labelTw = tw.label;
          dirty = true;
        }
        if (!item.placeholderTw && tw.placeholder) {
          item.placeholderTw = tw.placeholder;
          dirty = true;
        }
      }
      return list;
    };
    let fields = [];
    let materials = [];
    try {
      fields = JSON.parse(row.form_fields || '[]');
      materials = JSON.parse(row.materials || '[]');
    } catch {
      continue;
    }
    addTw(fields, values.fields);
    addTw(materials, values.materials);
    if (dirty) {
      changed += update.run(JSON.stringify(fields), JSON.stringify(materials), row.id).changes;
    }
  }
  return changed;
}

const PRO_EVENTS = {
  'NJE-SEED-CULTURE': {
    title: '奶龍島春日文化交流週',
    subtitle: '和來自各虛構城邦的朋友交換故事',
    description: '為期三天的文化交流:故事接龍、手作展覽與語言角。',
    venue_name: '中央廣場故事亭(虛構)',
    venue_note: '位於奶龍雕像東側 30 公尺,現場有藍色氣球指引。',
    conditions: '所有入口網站註冊使用者;填寫暱稱與聯絡方式即可。',
    notice: '請自備水杯與好心情;活動全程禁止投餵奶龍。',
    schedule: ['開場故事會', '語言角:奶龍語入門', '手作交換市集', '閉幕分享會'],
  },
  'NJE-SEED-FESTIVAL': {
    title: '奶龍國慶典巡遊',
    subtitle: '一年一度的虛構巡遊與煙火夜',
    description: '巡遊隊伍從中央大街出發,經過海港與居民區,終點為慶典廣場。晚間有虛構煙火表演與合唱。',
    venue_name: '中央大街 → 慶典廣場(虛構)',
    venue_note: '建議提前 30 分鐘到場,沿街均有工作人員指引。',
    conditions: '所有入口網站註冊使用者;未成年人需隨行成年人陪同(虛構要求)。',
    notice: '現場不燃放煙火。',
    schedule: ['巡遊集合', '慶典廣場合唱', '虛構煙火秀'],
  },
  'NJE-SEED-EXHIBITION': {
    title: '虛構港手作展',
    subtitle: '島民們的 100 件小作品',
    description: '展出島民投稿的虛構手作、繪畫與島嶼記憶。入場需展示活動憑證,可攜帶 1 位隨行夥伴。',
    venue_name: '海港倉庫 A 館(虛構)',
    venue_note: '南港碼頭 3 號門進入,館內禁止飲食。',
    conditions: '所有入口網站註冊使用者;報名時請上傳一張觀展介紹信或過往活動憑證(圖片/PDF,選填)。',
    notice: '請勿觸摸展品。',
    schedule: ['自由觀展', '作者見面會'],
  },
  'NJE-SEED-COMMUNITY': {
    title: '社區花園共創日',
    subtitle: '一起給島上的花園換新裝',
    description: '社區志工共同整理花園、繪製指示牌,並為新居民舉辦歡迎茶會。',
    venue_name: '海風社區花園(虛構)',
    venue_note: '社區中心後門進入,工具由主辦方提供。',
    conditions: '所有入口網站註冊使用者;歡迎攜帶 2 位隨行夥伴。',
    notice: '請穿耐髒的鞋子,現場提供手套。',
    schedule: ['集合與工具領取', '花園共創', '歡迎茶會'],
  },
  'NJE-SEED-DIPLOMATIC': {
    title: '使團聯誼晚宴',
    subtitle: '外交禮遇 × 虛構使團交流',
    description: '面向已登記外交身分的虛構使團成員的聯誼晚宴,含禮賓通道與紀念徽章。',
    venue_name: '皇家禮賓廳(虛構)',
    venue_note: '憑邀請函或外交身分編號從東側禮賓通道入場。',
    conditions: '僅限已完成外交身分登記的來賓;報名時填寫外交身分編號。',
    notice: '僅限受邀使團成員參加,憑邀請函或外交身分編號入場。',
    schedule: ['禮賓通道入場', '晚宴與交流', '紀念徽章頒發'],
  },
  'NJE-SEED-RESIDENT': {
    title: '居民夜市·夏夜場',
    subtitle: '居民專屬的虛構夜市',
    description: '僅面向奶龍國居民開放的夜市,攤位由居民與社區團體共同經營。',
    venue_name: '居民區燈籠街(虛構)',
    venue_note: '從居民中心步行 5 分鐘,憑居民編號核驗入場。',
    conditions: '僅限已完成居民登記的居民;報名時填寫居民編號。',
    notice: '攤位僅接受虛構貨幣,不收現實費用。',
    schedule: ['夜市開市', '居民才藝秀', '收市'],
  },
};

const PRO_EVENT_NOTICES = {
  报名须知: { title: '報名須知', body: '請使用暱稱報名,聯絡方式僅用於虛構通知,不會公開發布。' },
  场地变更: { title: '場地變更', body: '故事會場地由海風亭調整至中央廣場故事亭,請留意。' },
  巡游路线说明: { title: '巡遊路線說明', body: '巡遊隊伍將經過中央大街與海港,沿途設 3 個補給點。' },
};

const NOTICES = {
  visa_notices: {
    旅游签注开放申请: {
      title: '旅遊簽註開放申請',
      body: '奶龍國簽註申請署現已開放旅遊簽註(TOURIST)線上申請,審核預計 72 小時內完成。',
    },
    谨防冒充办证诈骗: {
      title: '謹防冒充辦證詐騙',
      body: '本署辦證完全免費,任何收費辦證的行為均為詐騙。',
    },
  },
  doc_notices: {
    七类文书认证全面开放: {
      title: '七類文書認證全面開放',
      body: '皇家文書與認證署現已開放簽註證明、邀請函、入境記錄證明、居民卡、活動憑證、外交文書、申訴決定書七類文書的線上認證申請,審核預計 72 小時內完成。',
    },
    认证规则与处理时长: {
      title: '認證規則與處理時長',
      body: '每份文書由認證署人工審核:提交後進入待認證佇列,材料齊全通常 72 小時內出結果;需要補件時請在 7 天內補交,逾期申請自動關閉。認證通過即產生帶編號的電子文書,可在驗真中心查驗。',
    },
    谨防冒充认证诈骗: {
      title: '謹防冒充認證詐騙',
      body: '本署認證完全免費:不收取任何費用,請勿相信任何收費代辦或「保證通過」的說法。',
    },
  },
  im_announcements: {
    '口岸通关须知(必读)': {
      title: '口岸通關須知(必讀)',
      body: '入境需持有效趣味簽註;通關碼一人一碼,截圖轉發無效;全程免費,不收取任何「通關費」。',
    },
    皇家口岸开放时间调整: {
      title: '皇家口岸開放時間調整',
      body: '即日起來自奶龍星的旅客請於 09:00-21:00 通關,夜間大門口岸暫停開放,嗅嗅巡邏隊會送大家回飯店。',
    },
  },
  res_notices: {
    居民登记开放申请: {
      title: '居民登記開放申請',
      body: '奶龍國皇家居民登記署現已開放「臨時居民」線上登記,審核預計 72 小時內完成。',
    },
    谨防冒充登记诈骗: {
      title: '謹防冒充登記詐騙',
      body: '居民登記完全免費。任何收費登記、代辦「永久居民」的行為均為詐騙,請勿相信。',
    },
  },
  dip_notices: {
    建交通道正式开放: {
      title: '建交通道正式開放',
      body: '皇家外交事務署現開放「虛構國家 × 正式建交」線上申請,審核預計 72 小時內完成。',
    },
    '外交身份登记须知(必读)': {
      title: '外交身分登記須知(必讀)',
      body: '外交身分須關聯一條已建交關係;任期最長 365 天;凍結/註銷後外交簽註與禮遇資格同步失效。',
    },
    虚拟礼遇说明: {
      title: '虛擬禮遇說明',
      body: '外交禮遇(入境禮遇通道、活動優先邀請、優先審核)以趣味徽章與記錄形式呈現。',
    },
  },
  pro_notices: {
    礼宾与活动署正式开放: {
      title: '禮賓與活動署正式開放',
      body: '活動報名、邀請函、活動憑證、接待方認證與禮賓服務現已開放。',
    },
    '报名须知(必读)': {
      title: '報名須知(必讀)',
      body: '報名免費;請使用暱稱報名;名額有限時進入候補;重複報名或惡意佔名額將被限制。',
    },
    礼宾服务说明: {
      title: '禮賓服務說明',
      body: '禮賓服務面向外賓接待、居民禮遇、外交禮遇與活動禮賓通道,以趣味記錄形式呈現。',
    },
    谨防活动诈骗: {
      title: '謹防活動詐騙',
      body: '本署活動全部免費,不存在「內部名額」「付費入場」「現實禮遇」。任何收費行為均為詐騙,請立即舉報。',
    },
  },
  appeal_notices: {
    申诉受理范围与时效说明: {
      title: '申訴受理範圍與時效說明',
      body: '本署受理對簽註、入境、居民登記、外交身分、文書認證五類業務結果不服提起的結果申訴,以及已處理申訴的複核申請。申訴提交後約 48 小時內受理,複核為一次終局。',
    },
    谨防冒充申诉诈骗: {
      title: '謹防冒充申訴詐騙',
      body: '本署受理申訴與複核完全免費,不收取任何費用,也不承諾任何現實效力。任何「收費加急」「保證撤銷原結果」的行為均為詐騙。',
    },
  },
};

function backfillByCode(db, table, codeColumn, columns, rows) {
  if (!rows) return 0;
  const sets = columns.map((c) => `${c}_tw = COALESCE(NULLIF(${c}_tw, ''), ?)`).join(', ');
  const stmt = db.prepare(`UPDATE ${table} SET ${sets} WHERE ${codeColumn} = ?`);
  let changed = 0;
  for (const [code, values] of Object.entries(rows)) {
    changed += stmt.run(...columns.map((c) => values[c] ?? null), code).changes;
  }
  return changed;
}

function backfillByTitle(db, table, rows) {
  if (!rows) return 0;
  const stmt = db.prepare(
    `UPDATE ${table}
     SET title_tw = COALESCE(NULLIF(title_tw, ''), ?),
         body_tw = COALESCE(NULLIF(body_tw, ''), ?)
     WHERE title = ?`
  );
  let changed = 0;
  for (const [title, values] of Object.entries(rows)) {
    changed += stmt.run(values.title, values.body, title).changes;
  }
  return changed;
}

// 旧库的种子日程时间仍是中文(`第 1 天 10:00`);改成语言中立写法,
// 新建库直接用 ASCII,老库在这里一次性归一。
function normalizeScheduleTime(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/^第\s*(\d+)\s*天\s*(\d{2}:\d{2})$/, 'D$1 $2')
    .replace(/^每日\s*(\d{2}:\d{2})\s*[-~～]\s*(\d{2}:\d{2})$/, 'Daily $1-$2')
    .replace(/^周末\s*(\d{2}:\d{2})$/, 'Weekend $1');
}

function backfillProtocolEvents(db, rows) {
  const select = db.prepare('SELECT id, schedule FROM pro_events WHERE event_no = ?');
  const update = db.prepare(
    `UPDATE pro_events SET
       title_tw = COALESCE(NULLIF(title_tw, ''), ?),
       subtitle_tw = COALESCE(NULLIF(subtitle_tw, ''), ?),
       description_tw = COALESCE(NULLIF(description_tw, ''), ?),
       venue_name_tw = COALESCE(NULLIF(venue_name_tw, ''), ?),
       venue_note_tw = COALESCE(NULLIF(venue_note_tw, ''), ?),
       conditions_tw = COALESCE(NULLIF(conditions_tw, ''), ?),
       notice_tw = COALESCE(NULLIF(notice_tw, ''), ?)
     WHERE event_no = ?`
  );
  let changed = 0;
  for (const [eventNo, values] of Object.entries(rows)) {
    const row = select.get(eventNo);
    if (!row) continue;
    changed += update.run(
      values.title,
      values.subtitle,
      values.description,
      values.venue_name,
      values.venue_note,
      values.conditions,
      values.notice,
      eventNo
    ).changes;
    let schedule = [];
    try {
      schedule = JSON.parse(row.schedule);
    } catch {
      schedule = [];
    }
    if (!Array.isArray(schedule)) continue;
    let dirty = false;
    schedule.forEach((item, index) => {
      const normalized = normalizeScheduleTime(item.time);
      if (normalized !== item.time) {
        item.time = normalized;
        dirty = true;
      }
      if (!item.titleTw && values.schedule[index]) {
        item.titleTw = values.schedule[index];
        dirty = true;
      }
    });
    if (dirty) db.prepare('UPDATE pro_events SET schedule = ? WHERE id = ?').run(JSON.stringify(schedule), row.id);
  }
  return changed;
}

export function backfillContentTranslations(db) {
  let changed = 0;
  changed += backfillByCode(db, 'services', 'key', ['name', 'description'], SERVICES);
  changed += backfillByCode(db, 'roles', 'key', ['name', 'description'], ROLES);
  changed += backfillByCode(db, 'permissions', 'key', ['name', 'description'], CONTENT_PERMISSIONS);
  changed += backfillByCode(db, 'visa_types', 'code', ['name', 'description', 'guide'], VISA_TYPES);
  changed += backfillByCode(db, 'doc_types', 'code', ['name', 'description', 'guide', 'biz_no_label'], DOC_TYPES);
  changed += backfillDocTypeNested(db, DOC_TYPE_FIELDS);
  changed += backfillByCode(db, 'im_ports', 'code', ['name', 'open_hours', 'notice', 'map_desc'], IM_PORTS);
  changed += backfillByCode(db, 'im_channels', 'name', ['name', 'description'], IM_CHANNELS);
  changed += backfillByCode(db, 'res_types', 'code', ['name', 'description', 'guide', 'benefits', 'duties'], RES_TYPES);
  changed += backfillByCode(db, 'dip_object_types', 'code', ['name', 'description', 'guide'], DIP_OBJECT_TYPES);
  changed += backfillByCode(db, 'dip_relation_types', 'code', ['name', 'description', 'guide'], DIP_RELATION_TYPES);
  changed += backfillByCode(db, 'dip_identity_types', 'code', ['name', 'description', 'guide'], DIP_IDENTITY_TYPES);
  changed += backfillByCode(db, 'dip_courtesy_types', 'code', ['name', 'description'], DIP_COURTESY_TYPES);
  changed += backfillByCode(db, 'dip_offices', 'code', ['name', 'location', 'open_hours', 'intro', 'contact', 'services'], DIP_OFFICES);
  changed += backfillByCode(db, 'pro_event_types', 'code', ['name', 'description', 'guide'], PRO_EVENT_TYPES);
  changed += backfillByCode(db, 'pro_courtesy_types', 'code', ['name', 'description', 'requirements'], PRO_COURTESY_TYPES);
  changed += backfillProtocolEvents(db, PRO_EVENTS);
  changed += backfillByTitle(db, 'pro_event_notices', PRO_EVENT_NOTICES);
  for (const [table, rows] of Object.entries(NOTICES)) {
    changed += backfillByTitle(db, table, rows);
  }
  return changed;
}