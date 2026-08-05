window.TEMU_REGIONS = [
  {
    key: 'us',
    name: '美区 / 北美站点',
    host: 'agentseller-us.temu.com',
    short: '美区'
  },
  {
    key: 'eu',
    name: '欧区 / 欧洲站点',
    host: 'agentseller-eu.temu.com',
    short: '欧区'
  },
  {
    key: 'global',
    name: '全球区 / 亚非拉站点',
    host: 'agentseller.temu.com',
    short: '全球区'
  }
];

window.TEMU_STORE_DATA = [
  {
    id: 1,
    alias: '创美家居旗舰店-01',
    mode: '半托管',
    company: '云易盒科技有限公司',
    shopId: 'TEMU-882910',
    shopName: 'Chuangmei Home Official',
    productToken: 'global_tk_8a92f3c1d7e04b6a9f21',
    productStatus: '校验通过',
    regions: {
      us: { enabled: true, token: 'order_us_tk_91ab22cdeef4', status: '连通正常' },
      eu: { enabled: true, token: 'order_eu_tk_55cc10aabb01', status: '连通正常' },
      global: { enabled: true, token: 'order_gl_tk_77dd88ee9900', status: '授权过期' }
    },
    updatedAt: '2026-08-05 10:20'
  },
  {
    id: 2,
    alias: '北美全托管店-A',
    mode: '全托管',
    company: '云易盒科技美国',
    shopId: 'TEMU-771205',
    shopName: 'YIYIHE Temu US Fulfilled',
    productToken: 'global_tk_bb11cc22dd33ee44',
    productStatus: '校验通过',
    regions: {
      us: { enabled: true, token: 'order_us_tk_aa11bb22cc33', status: '连通正常' },
      eu: { enabled: false, token: '', status: '未开通' },
      global: { enabled: false, token: '', status: '未开通' }
    },
    updatedAt: '2026-08-04 16:05'
  },
  {
    id: 3,
    alias: '欧亚试点店',
    mode: '半托管',
    company: '云易盒科技有限公司',
    shopId: 'TEMU-660134',
    shopName: 'YIYIHE EU-AF Trial',
    productToken: 'global_tk_pending_0001',
    productStatus: '未校验',
    regions: {
      us: { enabled: false, token: '', status: '未开通' },
      eu: { enabled: true, token: 'order_eu_tk_fail_0099', status: '校验失败' },
      global: { enabled: true, token: 'order_gl_tk_ok_7788', status: '连通正常' }
    },
    updatedAt: '2026-08-03 09:40'
  }
];
