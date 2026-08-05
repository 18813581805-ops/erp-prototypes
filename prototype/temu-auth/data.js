window.TEMU_SITES = [
  {
    key: 'us',
    short: '美区',
    name: '美区站点',
    host: 'agentseller-us.temu.com',
    defaultWarehouse: '美西仓'
  },
  {
    key: 'eu',
    short: '欧区',
    name: '欧区站点',
    host: 'agentseller-eu.temu.com',
    defaultWarehouse: '德国仓'
  },
  {
    key: 'global',
    short: '全球区',
    name: '全球区站点',
    host: 'agentseller.temu.com',
    defaultWarehouse: '华南中转仓'
  }
];

// 列表直接展示独立站点店铺（Site-Level Virtual Store）
window.TEMU_SITE_STORES = [
  {
    id: 101,
    parentPrefix: '创美家居',
    parentGroupId: 'PG-CMJJ',
    name: '创美家居-美区店',
    siteKey: 'us',
    mode: '半托管',
    company: '云易盒科技有限公司',
    shopId: 'TEMU-US-882910',
    officialName: 'Chuangmei Home Official',
    productToken: 'global_tk_8a92f3c1d7e04b6a9f21',
    productStatus: '校验通过',
    orderToken: 'order_us_tk_91ab22cdeef4',
    orderStatus: '正常拉取',
    warehouse: '美西仓',
    financeBoard: '已开通',
    updatedAt: '2026-08-05 10:20'
  },
  {
    id: 102,
    parentPrefix: '创美家居',
    parentGroupId: 'PG-CMJJ',
    name: '创美家居-欧区店',
    siteKey: 'eu',
    mode: '半托管',
    company: '云易盒科技有限公司',
    shopId: 'TEMU-EU-882911',
    officialName: 'Chuangmei Home Official',
    productToken: 'global_tk_8a92f3c1d7e04b6a9f21',
    productStatus: '校验通过',
    orderToken: 'order_eu_tk_55cc10aabb01',
    orderStatus: '正常拉取',
    warehouse: '德国仓',
    financeBoard: '已开通',
    updatedAt: '2026-08-05 10:20'
  },
  {
    id: 103,
    parentPrefix: '创美家居',
    parentGroupId: 'PG-CMJJ',
    name: '创美家居-全球区店',
    siteKey: 'global',
    mode: '半托管',
    company: '云易盒科技有限公司',
    shopId: 'TEMU-GL-882912',
    officialName: 'Chuangmei Home Official',
    productToken: 'global_tk_8a92f3c1d7e04b6a9f21',
    productStatus: '校验通过',
    orderToken: 'order_gl_tk_77dd88ee9900',
    orderStatus: 'Token 异常',
    warehouse: '华南中转仓',
    financeBoard: '已开通',
    updatedAt: '2026-08-05 10:20'
  },
  {
    id: 201,
    parentPrefix: '北美全托管',
    parentGroupId: 'PG-NA-FULL',
    name: '北美全托管-美区店',
    siteKey: 'us',
    mode: '全托管',
    company: '云易盒科技美国',
    shopId: 'TEMU-US-771205',
    officialName: 'YIYIHE Temu US Fulfilled',
    productToken: 'global_tk_bb11cc22dd33ee44',
    productStatus: '校验通过',
    orderToken: 'order_us_tk_aa11bb22cc33',
    orderStatus: '正常拉取',
    warehouse: '美西仓',
    financeBoard: '已开通',
    updatedAt: '2026-08-04 16:05'
  }
];
