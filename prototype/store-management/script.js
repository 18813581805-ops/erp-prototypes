// 店铺管理原型交互脚本
(function() {
  'use strict';

  var selectedIds = new Set();
  var activePlatform = '全部平台';
  var currentStore = null;
  var sensitiveUnlocked = false;
  var filteredStores = window.STORE_DATA.slice();
  var editOrigin = 'table';
  var pendingShopeeAssets = [];
  var pendingShopeeSourceStore = null;
  var pendingPermissionStores = [];
  var browserNameOptions = ['紫鸟', '战斧'];
  var paymentPlatformOptions = ['PingPong', 'WorldFirst', '连连支付'];
  var creatingBasicStore = false;
  var editOrderTokenRegion = 'us';
  var authOrderTokenRegion = 'us';
  var editOrderTokenDraft = null;
  var temuAuthEditing = false;
  var temuAuthHighlight = false;
  var ozonAuthEditing = false;
  var ozonAuthHighlight = false;
  var alibabaAuthEditing = false;
  var alibabaAuthHighlight = false;
  var OZON_CLIENT_ID_MAX = 20;
  var OZON_API_KEY_MAX = 36;
  // Temu 常见凭证长度：App Key≈32、App Secret≈40、access_token≈56~64；输入上限略留余量
  var TEMU_ACCESS_TOKEN_MAX = 128;
  var TEMU_APP_KEY_MAX = 64;
  var TEMU_APP_SECRET_MAX = 64;
  // 1688 session/access_token 常见约 50~64 位，上限对齐现有 access_token 限制
  var ALIBABA_ACCESS_TOKEN_MAX = 128;
  var TEMU_TOKEN_INPUT_IDS = {
    editOrderAccessToken: TEMU_ACCESS_TOKEN_MAX,
    editOrderAppKey: TEMU_APP_KEY_MAX,
    editOrderAppSecret: TEMU_APP_SECRET_MAX,
    editProductAccessToken: TEMU_ACCESS_TOKEN_MAX,
    editProductAppKey: TEMU_APP_KEY_MAX,
    editProductAppSecret: TEMU_APP_SECRET_MAX
  };

  function $(id) {
    return document.getElementById(id);
  }

  function value(id) {
    var el = $(id);
    return el ? el.value.trim() : '';
  }

  function syncSelect(id) {
    var el = $(id);
    if (el && el.tagName === 'SELECT') el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 2500);
  }

  function formatNow() {
    return new Date().toISOString().slice(0,16).replace('T',' ');
  }

  function nextYear() {
    var d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0,16).replace('T',' ');
  }

  function tagForAuth(status) {
    return window.AUTH_STATUS_MAP[status] || { tag: 'tag-gray', text: status || '未授权' };
  }

  function tagHtml(text, cls) {
    return '<span class="tag ' + (cls || '') + '">' + (text || '—') + '</span>';
  }

  function principalList() {
    return window.PRINCIPAL_DATA || [];
  }

  function findPrincipal(name) {
    return principalList().find(function(item) { return item.name === name; }) || null;
  }

  function principalCode(name) {
    var principal = findPrincipal(name);
    return principal ? principal.code : '—';
  }

  function principalEnterpriseRegistrationTime(name) {
    var principal = findPrincipal(name);
    return principal ? (principal.enterpriseRegistrationTime || '—') : '—';
  }

  function populatePrincipalSelect(id, selectedName, allowEmpty) {
    var select = $(id);
    if (!select) return;
    select.innerHTML = (allowEmpty ? '<option value="">请选择注册主体</option>' : '') + principalList().map(function(item) {
      return '<option value="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</option>';
    }).join('');
    if (selectedName && !findPrincipal(selectedName)) {
      select.insertAdjacentHTML('beforeend', '<option value="' + escapeHtml(selectedName) + '">' + escapeHtml(selectedName) + '</option>');
    }
    select.value = selectedName || (allowEmpty ? '' : (principalList()[0] ? principalList()[0].name : ''));
  }

  function updateRegistrationMeta(selectId, codeId, timeId) {
    var select = $(selectId);
    var code = $(codeId);
    var time = $(timeId);
    if (!select) return;
    if (code) code.textContent = principalCode(select.value);
    if (time) time.textContent = principalEnterpriseRegistrationTime(select.value);
  }

  function bindPrincipalSelector(selectId, codeId, timeId) {
    var select = $(selectId);
    if (!select) return;
    select.addEventListener('change', function() {
      updateRegistrationMeta(selectId, codeId, timeId);
    });
  }

  function authPill(label, status) {
    var cls = 'auth-pill';
    if (status === '已授权') cls += ' success';
    else if (status === '即将过期') cls += ' warning';
    else if (status === '已过期' || status === '未授权') cls += ' error';
    return '<span class="' + cls + '">' + label + '：' + (status || '未授权') + '</span>';
  }

  function parseAuthExpireTime(value) {
    if (!value || value === '—') return NaN;
    var normalized = String(value).trim().replace(/-/g, '/');
    return Date.parse(normalized);
  }

  function resolveStoreAuthStatus(store) {
    var status = (store && store.authStatus) || '未授权';
    if (!status || status === '—' || status === '未授权') return '未授权';
    var expireMs = parseAuthExpireTime(store && store.authExpire);
    if (!isNaN(expireMs)) {
      if (expireMs < Date.now()) return '已过期';
      var daysLeft = (expireMs - Date.now()) / (24 * 60 * 60 * 1000);
      if (daysLeft <= 30 && status === '已授权') return '即将过期';
    }
    return status;
  }

  function authSummaryHtml(store) {
    var items = [authPill('店铺', resolveStoreAuthStatus(store))];
    if (supportsAdAuth(store.platform)) {
      items.push(authPill('广告', store.adAuthStatus));
    }
    if (store.platform === 'Shopee') {
      items.push(authPill('联盟', store.affiliateAuthStatus));
    }
    return '<div class="auth-summary">' + items.join('') + '</div>';
  }

  function emptyTokenTriplet() {
    return { accessToken: '', appKey: '', appSecret: '' };
  }

  function ensureTemuTokens(store) {
    if (!store.orderPullTokens) {
      store.orderPullTokens = {
        us: emptyTokenTriplet(),
        eu: emptyTokenTriplet(),
        global: emptyTokenTriplet()
      };
    }
    ['us', 'eu', 'global'].forEach(function(region) {
      store.orderPullTokens[region] = Object.assign(emptyTokenTriplet(), store.orderPullTokens[region] || {});
    });
    store.productPullToken = Object.assign(emptyTokenTriplet(), store.productPullToken || {});
  }

  function tokenTripletHasValue(token) {
    return !!(token && (token.accessToken || token.appKey || token.appSecret));
  }

  function storeHasTemuTokens(store) {
    ensureTemuTokens(store);
    return ['us', 'eu', 'global'].some(function(region) {
      return tokenTripletHasValue(store.orderPullTokens[region]);
    }) || tokenTripletHasValue(store.productPullToken);
  }

  function maskToken(value) {
    if (!value) return '—';
    if (value.length <= 8) return '****';
    return value.slice(0, 4) + '****' + value.slice(-4);
  }

  function applyTemuAuthFromTokens(store) {
    var mainAccountId = store.mainAccountId;
    if (storeHasTemuTokens(store)) {
      store.authStatus = '已授权';
      store.authTime = formatNow();
      store.authExpire = nextYear();
      store.syncOrderTime = formatNow();
    } else {
      store.authStatus = '未授权';
      store.authTime = '—';
      store.authExpire = '—';
    }
    store.mainAccountId = mainAccountId;
  }

  function isTemuPlatform(platform) {
    return platform === 'Temu';
  }

  function temuRegionDefs() {
    return [
      { key: 'us', label: '美区', suffix: '_US' },
      { key: 'eu', label: '欧区', suffix: '_EU' },
      { key: 'global', label: '全球', suffix: '_BT_GLOBAL' }
    ];
  }

  function temuRegionByKey(key) {
    return temuRegionDefs().find(function(item){ return item.key === key; }) || null;
  }

  function temuRegionByLabel(label) {
    return temuRegionDefs().find(function(item){ return item.label === label; }) || null;
  }

  function stripTemuAliasSuffix(alias) {
    return String(alias || '').replace(/(_US|_EU|_BT_GLOBAL)$/, '');
  }

  function buildTemuAlias(baseAlias, regionKey) {
    var def = temuRegionByKey(regionKey);
    return stripTemuAliasSuffix(baseAlias) + (def ? def.suffix : '');
  }

  function resolveTemuRegionKey(store, aliasInput) {
    if (store && store.temuRegionKey && temuRegionByKey(store.temuRegionKey)) return store.temuRegionKey;
    if (store && store.region) {
      var byLabel = temuRegionByLabel(store.region);
      if (byLabel) return byLabel.key;
    }
    var alias = String(aliasInput || (store && store.alias) || '');
    if (/_US$/i.test(alias)) return 'us';
    if (/_EU$/i.test(alias)) return 'eu';
    if (/_BT_GLOBAL$/i.test(alias)) return 'global';
    return 'us';
  }

  function nextStoreId() {
    var ids = (window.STORE_DATA || []).map(function(s){ return s.id; }).concat([0]);
    return Math.max.apply(null, ids) + 1;
  }

  function applyTemuRegionToStore(store, regionKey, baseAlias) {
    var def = temuRegionByKey(regionKey);
    store.temuRegionKey = regionKey;
    store.region = def ? def.label : '';
    store.temuBaseAlias = stripTemuAliasSuffix(baseAlias);
    store.alias = buildTemuAlias(store.temuBaseAlias, regionKey);
    // 主店铺名称用基础别名；区域店别名带后缀，列表按组展示为同一主店铺下的区域店
    store.name = store.temuBaseAlias;
    store.relationRole = 'temu-site';
    if (!store.temuGroupId) {
      store.temuGroupId = 'TG-' + store.temuBaseAlias;
    }
    ensureTemuTokens(store);
  }

  function getTemuGroupKey(store) {
    if (!store || !isTemuPlatform(store.platform)) return '';
    return store.temuGroupId || store.temuBaseAlias || stripTemuAliasSuffix(store.alias || '') || String(store.id);
  }

  function getTemuMainName(store) {
    return store.temuBaseAlias || stripTemuAliasSuffix(store.alias || '') || store.name || '—';
  }

  function getTemuSiblings(store) {
    var key = getTemuGroupKey(store);
    if (!key) return [];
    return (window.STORE_DATA || []).filter(function(item) {
      return isTemuPlatform(item.platform) && getTemuGroupKey(item) === key;
    });
  }

  function cloneStoreForTemuRegion(source, regionKey, baseAlias, explicitId) {
    var clone = JSON.parse(JSON.stringify(source));
    clone.id = explicitId != null ? explicitId : nextStoreId();
    clone._draft = false;
    clone._pendingTemuAuthHighlight = false;
    applyTemuRegionToStore(clone, regionKey, baseAlias);
    return clone;
  }


  var temuGroupExpanded = {};

  function isTemuGroupExpanded(groupKey) {
    if (!groupKey) return false;
    return !!temuGroupExpanded[groupKey];
  }

  function temuRegionOrder(stores) {
    var order = { us: 1, eu: 2, global: 3 };
    return stores.slice().sort(function(a, b) {
      return (order[a.temuRegionKey] || 9) - (order[b.temuRegionKey] || 9);
    });
  }

  function isOzonPlatform(platform) {
    return platform === 'Ozon';
  }

  function ensureOzonAuth(store) {
    if (!('clientId' in store) || store.clientId == null) store.clientId = '';
    if (!('apiKey' in store) || store.apiKey == null) store.apiKey = '';
  }

  function storeHasOzonAuth(store) {
    ensureOzonAuth(store);
    return !!(store.clientId || store.apiKey);
  }

  function applyOzonAuthFromTokens(store) {
    var mainAccountId = store.mainAccountId;
    if (storeHasOzonAuth(store)) {
      store.authStatus = '已授权';
      store.authTime = formatNow();
      store.authExpire = nextYear();
      store.syncOrderTime = formatNow();
    } else {
      store.authStatus = '未授权';
      store.authTime = '—';
      store.authExpire = '—';
    }
    store.mainAccountId = mainAccountId;
  }

  function ensureOperationLogs(store) {
    if (!store.operationLogs) {
      store.operationLogs = [
        { time: '2026-05-19 14:30', operator: 'Freddy', module: '授权', type: '验证', content: '完成店铺授权校验' },
        { time: '2026-05-19 10:00', operator: 'Freddy', module: '基础资料', type: '新增', content: '创建店铺记录' }
      ];
    }
  }

  function pushOperationLog(store, module, type, content) {
    ensureOperationLogs(store);
    store.operationLogs.unshift({
      time: formatNow(),
      operator: 'Freddy',
      module: module,
      type: type,
      content: content
    });
  }

  function formatLogValue(value) {
    return value ? String(value) : '（空）';
  }

  function syncStoreTypeOptions(platform, currentValue) {
    var select = $('editStoreType');
    var group = $('editStoreTypeGroup');
    if (!select) return;
    var hideType = hidesStoreType(platform);
    if (group) group.hidden = hideType;
    if (hideType) {
      select.value = '';
      syncSelect('editStoreType');
      return;
    }
    var temuLike = isTemuPlatform(platform) || platform === 'AliExpress';
    var lazada = platform === 'Lazada';
    var options;
    if (temuLike) {
      options = [['', '请选择店铺类型'], ['全托管', '全托管'], ['半托管', '半托管']];
    } else if (lazada) {
      options = [['', '请选择店铺类型'], ['跨境', '跨境'], ['本土', '本土']];
    } else {
      options = [['', '请选择店铺类型'], ['本土', '本土'], ['全球', '全球']];
    }
    select.innerHTML = options.map(function(item) {
      return '<option value="' + item[0] + '">' + item[1] + '</option>';
    }).join('');
    var val = currentValue || '';
    if (temuLike) {
      select.value = (val === '全托管' || val === '半托管') ? val : '';
    } else if (lazada) {
      if (val === '跨境' || val === '本土') select.value = val;
      else if (isGlobalStoreType(val) || val === '全球') select.value = '跨境';
      else if (val) select.value = '本土';
      else select.value = '';
    } else if (val === '全托管' || val === '半托管' || val === '跨境') {
      select.value = '';
    } else {
      select.value = val ? (isGlobalStoreType(val) ? '全球' : '本土') : '';
    }
    syncSelect('editStoreType');
  }

  function syncIsMallField(platform, currentValue) {
    var group = $('editIsMallGroup');
    var select = $('editIsMall');
    if (!group || !select) return;
    var isShopee = platform === 'Shopee';
    group.hidden = !isShopee;
    if (!isShopee) {
      select.value = '';
      syncSelect('editIsMall');
      return;
    }
    if (currentValue === true || currentValue === '是') select.value = '是';
    else if (currentValue === false || currentValue === '否') select.value = '否';
    else select.value = '';
    syncSelect('editIsMall');
  }

  function normalizeStore(store) {
    if (!store.storeEmail) store.storeEmail = store.platform === 'TikTok Shop' ? 'tiktok-store@yiyihe.com' : '';
    if (!store.paymentAccounts) {
      store.paymentAccounts = store.fundPlatform ? [{
        platform: store.fundPlatform,
        account: store.fundAccount || '—',
        accountRaw: store.fundAccountRaw || store.fundAccount || '',
        accountId: store.fundAccountId || '',
        currency: store.platform === 'Amazon' ? 'USD' : 'USD'
      }] : [];
    }
    if (!store.bodyChangeRecords) store.bodyChangeRecords = [];
    if (!store.paymentChangeRecords) store.paymentChangeRecords = [];
    if (!store.permissions) store.permissions = ['订单查看'];
    if (!store.adAccountId) store.adAccountId = '';
    if (!store.bcId) store.bcId = '';
    if (!store.registrationCompany) store.registrationCompany = store.body || '';
    if (!store.registrationCode) store.registrationCode = principalCode(store.registrationCompany);
    if (!store.registrationDate) store.registrationDate = principalEnterpriseRegistrationTime(store.registrationCompany);
    store.body = store.registrationCompany;
    if (!('adSyncSetting' in store)) store.adSyncSetting = null;
    if (!('isMall' in store)) store.isMall = false;
    if (isTemuPlatform(store.platform)) {
      ensureTemuTokens(store);
      if (!store.temuRegionKey && store.region) {
        var regionDef = temuRegionByLabel(store.region);
        if (regionDef) store.temuRegionKey = regionDef.key;
      }
      if (!store.temuBaseAlias && store.alias) {
        store.temuBaseAlias = stripTemuAliasSuffix(store.alias);
      }
      if (store.temuBaseAlias) {
        store.name = store.temuBaseAlias;
        store.relationRole = store.relationRole || 'temu-site';
        if (!store.temuGroupId) store.temuGroupId = 'TG-' + store.temuBaseAlias;
      }
    }
    if (isOzonPlatform(store.platform)) ensureOzonAuth(store);
    if (is1688Platform(store.platform)) ensureAlibabaAuth(store);
    ensureOperationLogs(store);
    (store.paymentAccounts || []).forEach(function(account) {
      if (account.platform && paymentPlatformOptions.indexOf(account.platform) === -1) paymentPlatformOptions.push(account.platform);
    });
    if (!store.childStores && store.relatedStores && store.relatedStores.length) {
      store.childStores = store.relatedStores.map(function(name, index) {
        return { alias: name, site: index === 0 ? '马来西亚' : '泰国', authStatus: '成功' };
      });
    }
  }

  function getRelatedChildren(store) {
    normalizeStore(store);
    if (store.childStores && store.childStores.length) return store.childStores;
    if (!store.mainAccountId) return [];
    return window.STORE_DATA.filter(function(item) {
      return item.parentMainAccountId && item.parentMainAccountId === store.mainAccountId;
    }).map(function(item) {
      return { alias: item.alias, site: item.site, authStatus: item.authStatus === '已授权' ? '成功' : item.authStatus, storeId: item.id };
    });
  }

  function isShopeeMainStore(store) {
    return store.platform === 'Shopee' && (store.relationRole === 'main' || getRelatedChildren(store).length > 0);
  }

  function shouldUseMainAccountAuth(store) {
    if (!store || store.platform !== 'Shopee') return false;
    return store.authType === 'main_account' || isGlobalStoreType(store.storeType) || isShopeeMainStore(store);
  }

  function applyFilters() {
    var keyword = value('filterKeyword').toLowerCase();
    var body = $('filterBody').value;
    var site = $('filterSite').value;
    var status = $('filterStatus').value;
    var auth = $('filterAuth').value;
    var operator = value('filterOperator');
    var isMain = $('filterMainAccount').value;
    var isSip = $('filterSip').value;
    var platformType = $('filterPlatformType').value;
    var bu = $('filterBU').value;

    filteredStores = window.STORE_DATA.filter(function(s) {
      var text = [s.name, s.alias, s.subName, s.platformShopName].join(' ').toLowerCase();
      if (activePlatform === '其他平台') {
        if (isNamedPlatformTab(s.platform)) return false;
      } else if (activePlatform !== '全部平台' && s.platform !== activePlatform) {
        return false;
      }
      if (keyword && text.indexOf(keyword) === -1) return false;
      if (body !== '全部' && s.body !== body) return false;
      if (site !== '全部' && s.site !== site) return false;
      if (status !== '全部') {
        if (status === '停用') {
          if (s.status !== '停用' && s.status !== '关闭' && s.status !== '未启用') return false;
        } else if (s.status !== status) {
          return false;
        }
      }
      if (auth !== '全部' && resolveStoreAuthStatus(s) !== auth) return false;
      if (operator && s.operator.indexOf(operator) === -1) return false;
      if (isMain !== '全部' && (s.mainAccountId ? '是' : '否') !== isMain) return false;
      if (isSip !== '全部' && (s.isSip ? '是' : '否') !== isSip) return false;
      if (platformType !== '全部' && s.platformStoreType !== platformType) return false;
      if (bu !== '全部' && s.bu !== bu) return false;
      return true;
    });
  }

  function temuOrderRegionsText(store) {
    if (!store || !isTemuPlatform(store.platform)) return '';
    ensureTemuTokens(store);
    var labels = { us: '美区', eu: '欧区', global: '全球' };
    return ['us', 'eu', 'global'].filter(function(region) {
      return tokenTripletHasValue(store.orderPullTokens[region]);
    }).map(function(region) {
      return labels[region];
    }).join('、');
  }


  function buildTemuAliasStackHtml(stores) {
    return '<div class="temu-pair-stack">' + stores.map(function(s) {
      return '<div class="temu-alias-row">' +
        '<span class="temu-alias-text" title="' + escapeHtml(s.alias || '') + '">' + escapeHtml(s.alias || '—') + '</span>' +
        (s.region ? '<span class="temu-region-pill">' + escapeHtml(s.region) + '</span>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  function buildTemuAliasCellHtml(store) {
    if (!store) return '—';
    return '<div class="temu-alias-row">' +
      '<span class="temu-alias-text" title="' + escapeHtml(store.alias || '') + '">' + escapeHtml(store.alias || '—') + '</span>' +
      (store.region ? '<span class="temu-region-pill">' + escapeHtml(store.region) + '</span>' : '') +
    '</div>';
  }

  function buildTemuTimeStackHtml(stores, field) {
    return '<div class="temu-pair-stack">' + stores.map(function(s) {
      return '<span class="temu-time-line">' + escapeHtml(s[field] || '—') + '</span>';
    }).join('') + '</div>';
  }

  function buildTemuMergedOrStackHtml(stores, field) {
    var values = stores.map(function(s){ return s[field] || '—'; });
    var allSame = values.length > 0 && values.every(function(v){ return v === values[0]; });
    if (allSame) {
      return '<span class="temu-shared-value">' + escapeHtml(values[0]) + '</span>';
    }
    return buildTemuTimeStackHtml(stores, field);
  }

  function buildTemuAuthStatusHtml(stores) {
    // 列表中的区域店均为已创建实体；未开通区域不会生成子店，故授权状态按主店铺汇总展示一条
    var statuses = stores.map(resolveStoreAuthStatus);
    var groupStatus = '未授权';
    if (statuses.some(function(st){ return st === '已过期'; })) groupStatus = '已过期';
    else if (statuses.some(function(st){ return st === '即将过期'; })) groupStatus = '即将过期';
    else if (statuses.every(function(st){ return st === '已授权'; })) groupStatus = '已授权';
    else if (statuses.some(function(st){ return st === '已授权' || st === '即将过期'; })) groupStatus = '已授权';
    return '<div class="auth-summary temu-shared-value">' + authPill('店铺', groupStatus) + '</div>';
  }

  function isStoreEnabled(store) {
    if (!store) return false;
    if (store.status === '启用') return true;
    if (store.status === '停用' || store.status === '关闭' || store.status === '未启用' || store.status === '注销') return false;
    return !!store.enabled;
  }

  function applyStoreEnabled(store, enabled) {
    if (!store) return;
    store.enabled = !!enabled;
    if (store.status === '注销') return;
    store.status = enabled ? '启用' : '停用';
    if (enabled && (store.useStatus === '待启用' || !store.useStatus)) {
      store.useStatus = '正常使用';
    }
  }

  function storeStatusSwitchHtml(opts) {
    opts = opts || {};
    var checked = opts.checked ? ' checked' : '';
    var attrs = '';
    if (opts.id != null) attrs += ' data-id="' + opts.id + '"';
    return '<label class="store-status-switch" title="打开启用，关闭停用">' +
      '<input type="checkbox" class="store-status-toggle"' + attrs + checked + ' />' +
      '<span class="store-status-track"></span>' +
    '</label>';
  }

  function buildTemuStatusStackHtml(stores) {
    return '<div class="temu-pair-stack temu-status-stack">' + stores.map(function(s) {
      return storeStatusSwitchHtml({ checked: isStoreEnabled(s), id: s.id });
    }).join('') + '</div>';
  }

  function buildTemuGroupCompactHtml(groupKey, stores) {
    stores = temuRegionOrder(stores);
    var mainName = getTemuMainName(stores[0]);
    var body = stores[0].body || '—';
    var storeType = supportsStoreType(stores[0].platform) ? displayStoreType(stores[0].storeType) : '';
    var bu = stores[0].bu || '—';
    var allChecked = stores.every(function(s){ return selectedIds.has(s.id); });
    var primary = stores[0];
    var authTimeSame = stores.every(function(s){ return (s.authTime || '—') === (stores[0].authTime || '—'); });
    // 授权到期时间业务上同一主店铺共用一条：取各区域中最早到期（有效日期）
    var sharedExpire = stores.reduce(function(best, s) {
      var v = s.authExpire || '—';
      if (v === '—') return best;
      if (best === '—' || best === '') return v;
      var a = parseAuthExpireTime(best);
      var b = parseAuthExpireTime(v);
      if (isNaN(a)) return v;
      if (isNaN(b)) return best;
      return b < a ? v : best;
    }, stores[0].authExpire || '—');
    return '<tr class="temu-group-row" data-temu-group="' + escapeHtml(groupKey) + '">' +
      '<td class="col-check temu-shared-cell"><input type="checkbox" class="temu-group-checkbox" data-temu-group="' + escapeHtml(groupKey) + '" ' + (allChecked ? 'checked' : '') + ' /></td>' +
      '<td class="col-name temu-shared-cell">' +
        '<div class="temu-main-cell">' +
          '<div class="temu-tree-content">' +
            '<a href="javascript:void(0)" class="store-name-link temu-main-name" data-op="详情" data-id="' + primary.id + '">' + escapeHtml(mainName) + '</a>' +
            '<span class="tag tag-blue temu-role-tag">主店铺</span>' +
          '</div>' +
        '</div>' +
      '</td>' +
      '<td class="col-alias temu-stack-cell">' + buildTemuAliasStackHtml(stores) + '</td>' +
      '<td class="col-body temu-shared-cell" title="' + escapeHtml(body) + '">' + escapeHtml(body) + '</td>' +
      '<td class="col-site col-site-field temu-shared-cell"></td>' +
      '<td class="col-region platform-col platform-amazon temu-shared-cell">—</td>' +
      '<td class="col-type col-type-field temu-shared-cell">' + storeType + '</td>' +
      '<td class="col-platform-type temu-shared-cell">—</td>' +
      '<td class="col-sub platform-col platform-shopee temu-shared-cell">—</td>' +
      '<td class="col-shopee-ext platform-col platform-shopee temu-shared-cell">—</td>' +
      '<td class="col-mall platform-col platform-mall temu-shared-cell">—</td>' +
      '<td class="col-child-count platform-col platform-shopee temu-shared-cell">—</td>' +
      '<td class="col-ad-account platform-col platform-tiktok temu-shared-cell">—</td>' +
      '<td class="col-bc-id platform-col platform-tiktok temu-shared-cell">—</td>' +
      '<td class="col-bu temu-shared-cell">' + escapeHtml(bu) + '</td>' +
      '<td class="col-status temu-stack-cell">' + buildTemuStatusStackHtml(stores) + '</td>' +
      '<td class="col-auth temu-shared-cell">' + buildTemuAuthStatusHtml(stores) + '</td>' +
      '<td class="col-auth-time' + (authTimeSame ? ' temu-shared-cell' : ' temu-stack-cell') + '">' + buildTemuMergedOrStackHtml(stores, 'authTime') + '</td>' +
      '<td class="col-expire temu-shared-cell"><span class="temu-shared-value">' + escapeHtml(sharedExpire) + '</span></td>' +
      '<td class="col-sync temu-shared-cell">' + escapeHtml(primary.syncOrderTime || '—') + '</td>' +
      '<td class="col-ops temu-shared-cell">' + escapeHtml((primary.operator || '—') + ' / ' + (primary.cs || '—')) + '</td>' +
      '<td class="col-actions temu-shared-cell"><div class="cell-actions">' +
        '<button class="table-action-link" data-op="详情" data-id="' + primary.id + '" type="button">详情</button>' +
        '<button class="table-action-link" data-op="编辑" data-id="' + primary.id + '" type="button">编辑</button>' +
        '<button class="table-action-link" data-op="立即授权" data-id="' + primary.id + '" type="button">立即授权 ▾</button>' +
        '<button class="table-action-more" data-op="更多" data-id="' + primary.id + '" type="button">更多 ▾</button>' +
      '</div></td>' +
    '</tr>';
  }

  function buildStoreRowHtml(s, options) {
    options = options || {};
    var checked = selectedIds.has(s.id) ? 'checked' : '';
    var childStores = s.platform === 'Shopee' ? getRelatedChildren(s) : [];
    var childCountHtml = isShopeeMainStore(s)
      ? '<button class="table-inline-link" data-op="子店铺" data-id="' + s.id + '" type="button">' + childStores.length + '</button>'
      : '—';
    var opsHtml =
      '<button class="table-action-link" data-op="详情" data-id="' + s.id + '" type="button">详情</button>' +
      '<button class="table-action-link" data-op="编辑" data-id="' + s.id + '" type="button">编辑</button>' +
      (supportsQuickAuth(s.platform)
        ? '<button class="table-action-link" data-op="立即授权" data-id="' + s.id + '" type="button">立即授权 ▾</button>'
        : '') +
      '<button class="table-action-more" data-op="更多" data-id="' + s.id + '" type="button">更多 ▾</button>';
    var shopeeExt = '—';
    if (s.platform === 'Shopee') {
      if (s.relationRole === 'child') shopeeExt = '子店铺 / ' + (s.isSip ? '是' : '否');
      else if (isShopeeMainStore(s)) shopeeExt = '主账号 / ' + (s.isSip ? '是' : '否');
      else shopeeExt = (s.mainAccountId ? '主账号' : '否') + ' / ' + (s.isSip ? '是' : '否');
    }

    var nameHtml;
    var rowClass = '';
    if (options.temuSingle) {
      rowClass = ' class="temu-site-row"';
      nameHtml =
        '<div class="temu-main-cell">' +
          '<div class="temu-tree-content">' +
            '<a href="javascript:void(0)" class="store-name-link" data-op="详情" data-id="' + s.id + '">' + escapeHtml(getTemuMainName(s)) + '</a>' +
            '<span class="tag tag-blue temu-role-tag">主店铺</span>' +
          '</div>' +
        '</div>';
    } else {
      nameHtml = '<a href="javascript:void(0)" class="store-name-link" data-op="详情" data-id="' + s.id + '">' + escapeHtml(s.name || '—') + '</a>';
    }

    var rows = '';
    rows += '<tr' + rowClass + ' data-store-id="' + s.id + '"' + (options.groupKey ? ' data-temu-group="' + escapeHtml(options.groupKey) + '"' : '') + '>';
    rows += '<td class="col-check"><input type="checkbox" class="row-checkbox" data-id="' + s.id + '" ' + checked + ' /></td>';
    rows += '<td class="col-name" title="' + escapeHtml(s.name || s.alias || '—') + '">' + nameHtml + '</td>';
    rows += '<td class="col-alias">' + (isTemuPlatform(s.platform) || options.temuSingle ? buildTemuAliasCellHtml(s) : escapeHtml(s.alias || '—')) + '</td>';
    rows += '<td class="col-body" title="' + escapeHtml(s.body || '—') + '">' + escapeHtml(s.body || '—') + '</td>';
    rows += '<td class="col-site col-site-field">' + (supportsSiteField(s.platform) ? tagHtml(s.site) : '') + '</td>';
    rows += '<td class="col-region platform-col platform-amazon">' + (s.platform === 'Amazon' ? (s.region || '—') : '—') + '</td>';
    rows += '<td class="col-type col-type-field">' + (supportsStoreType(s.platform) ? displayStoreType(s.storeType) : '') + '</td>';
    rows += '<td class="col-platform-type">' + (s.platformStoreType || '—') + '</td>';
    rows += '<td class="col-sub platform-col platform-shopee">' + (s.platform === 'Shopee' ? (s.subName || '—') : '—') + '</td>';
    rows += '<td class="col-shopee-ext platform-col platform-shopee">' + shopeeExt + '</td>';
    rows += '<td class="col-mall platform-col platform-mall">' + (s.platform === 'Shopee' ? (s.isMall ? '是' : '否') : '—') + '</td>';
    rows += '<td class="col-child-count platform-col platform-shopee">' + childCountHtml + '</td>';
    rows += '<td class="col-ad-account platform-col platform-tiktok">' + (s.platform === 'TikTok Shop' ? (s.adAccountId || '—') : '—') + '</td>';
    rows += '<td class="col-bc-id platform-col platform-tiktok">' + (s.platform === 'TikTok Shop' ? (s.bcId || '—') : '—') + '</td>';
    rows += '<td class="col-bu">' + (s.bu || '—') + '</td>';
    rows += '<td class="col-status">' + storeStatusSwitchHtml({ checked: isStoreEnabled(s), id: s.id }) + '</td>';
    rows += '<td class="col-auth">' + authSummaryHtml(s) + '</td>';
    rows += '<td class="col-auth-time">' + (s.authTime || '—') + '</td>';
    rows += '<td class="col-expire">' + (s.authExpire || '—') + '</td>';
    rows += '<td class="col-sync">' + (s.syncOrderTime || '—') + '</td>';
    rows += '<td class="col-ops">' + (s.operator || '—') + ' / ' + (s.cs || '—') + '</td>';
    rows += '<td class="col-actions"><div class="cell-actions">' + opsHtml + '</div></td>';
    rows += '</tr>';
    return rows;
  }

  function buildRenderEntries(stores) {
    var entries = [];
    var seenTemuGroups = {};
    stores.forEach(function(s) {
      if (!isTemuPlatform(s.platform)) {
        entries.push({ type: 'store', store: s });
        return;
      }
      var key = getTemuGroupKey(s);
      if (seenTemuGroups[key]) return;
      seenTemuGroups[key] = true;
      var groupStores = temuRegionOrder(stores.filter(function(item) {
        return isTemuPlatform(item.platform) && getTemuGroupKey(item) === key;
      }));
      if (groupStores.length > 1) {
        entries.push({ type: 'temu-group', key: key, stores: groupStores });
      } else {
        entries.push({ type: 'temu-single', store: groupStores[0] });
      }
    });
    return entries;
  }

  function renderTable() {
    applyFilters();
    var tbody = $('storeTableBody');
    var rows = '';
    var displayCount = 0;
    buildRenderEntries(filteredStores).forEach(function(entry) {
      if (entry.type === 'temu-group') {
        rows += buildTemuGroupCompactHtml(entry.key, entry.stores);
        displayCount += 1;
      } else if (entry.type === 'temu-single') {
        rows += buildStoreRowHtml(entry.store, { temuSingle: true, groupKey: getTemuGroupKey(entry.store) });
        displayCount += 1;
      } else {
        rows += buildStoreRowHtml(entry.store);
        displayCount += 1;
      }
    });
    tbody.innerHTML = rows || '<tr><td colspan="21" class="empty-cell">暂无符合条件的店铺</td></tr>';
    applyPlatformColumns();
    $('totalCount').textContent = displayCount;
    $('selectedCount').textContent = '已选 ' + selectedIds.size + ' 项';
    $('btnBatchDelete').disabled = selectedIds.size === 0;
    $('btnBatchDownloadPayment').disabled = selectedIds.size === 0;
  }

  function applyPlatformColumns() {
    var showShopee = activePlatform === 'Shopee';
    var showAmazon = activePlatform === 'Amazon';
    var showTiktok = activePlatform === 'TikTok Shop';
    var showMall = activePlatform === 'Shopee' || activePlatform === '全部平台';
    var showSiteCol = activePlatform === '全部平台' || supportsSiteField(activePlatform);
    var showTypeCol = activePlatform === '全部平台' || supportsStoreType(activePlatform);
    document.querySelectorAll('.platform-shopee').forEach(function(el){ el.classList.toggle('is-hidden-col', !showShopee); });
    document.querySelectorAll('.platform-amazon').forEach(function(el){ el.classList.toggle('is-hidden-col', !showAmazon); });
    document.querySelectorAll('.platform-tiktok').forEach(function(el){ el.classList.toggle('is-hidden-col', !showTiktok); });
    document.querySelectorAll('.platform-mall').forEach(function(el){ el.classList.toggle('is-hidden-col', !showMall); });
    document.querySelectorAll('.col-site-field').forEach(function(el){ el.classList.toggle('is-hidden-col', !showSiteCol); });
    document.querySelectorAll('.col-type-field').forEach(function(el){ el.classList.toggle('is-hidden-col', !showTypeCol); });
  }

  function bindTabs() {
    document.querySelectorAll('.platform-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.platform-tab').forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        activePlatform = tab.textContent.trim().replace(/\s*\(\d+\)$/, '');
        if (activePlatform === '全部') activePlatform = '全部平台';
        closeRowAuthMenu();
        renderTable();
      });
    });
  }

  function supportsSiteField(platform) {
    return ['Amazon', 'Shopee', 'Lazada', 'TikTok Shop'].indexOf(platform) >= 0;
  }

  function syncSiteFieldVisibility(platform) {
    var support = supportsSiteField(platform);
    var readonlyGroup = $('editSiteReadonlyGroup');
    var selectGroup = $('editSiteSelectGroup');
    if (!readonlyGroup || !selectGroup) return;
    if (!support) {
      readonlyGroup.hidden = true;
      selectGroup.hidden = true;
      if ($('editSiteSelect')) {
        $('editSiteSelect').value = '';
        syncSelect('editSiteSelect');
      }
      return;
    }
    if (creatingBasicStore) {
      readonlyGroup.hidden = true;
      selectGroup.hidden = false;
    } else {
      selectGroup.hidden = true;
      readonlyGroup.hidden = false;
    }
  }

  function is1688Platform(platform) {
    return platform === '1688';
  }

  function isAlibabaFamilyPlatform(platform) {
    return is1688Platform(platform);
  }

  function supportsStoreType(platform) {
    return ['AliExpress', 'Shopee', 'Lazada', 'Temu'].indexOf(platform) >= 0;
  }

  function hidesStoreType(platform) {
    return !supportsStoreType(platform);
  }

  function ensureAlibabaAuth(store) {
    if (!('accessToken' in store) || store.accessToken == null) store.accessToken = '';
  }

  function storeHasAlibabaAuth(store) {
    ensureAlibabaAuth(store);
    return !!(store.accessToken && String(store.accessToken).trim());
  }

  function applyAlibabaAuthFromToken(store) {
    var mainAccountId = store.mainAccountId;
    if (storeHasAlibabaAuth(store)) {
      store.authStatus = '已授权';
      store.authTime = formatNow();
      store.authExpire = nextYear();
      store.syncOrderTime = formatNow();
    } else {
      store.authStatus = '未授权';
      store.authTime = '—';
      store.authExpire = '—';
    }
    store.mainAccountId = mainAccountId;
  }

  function isNamedPlatformTab(platform) {
    return ['Amazon', 'Shopee', 'AliExpress', 'Lazada', 'TikTok Shop', 'Temu', 'Ozon', '1688'].indexOf(platform) >= 0;
  }

  function isMiscOtherPlatform(platform) {
    return ['京东', '抖音', '美客多', '沃尔玛', 'Wish', '阿里巴巴国际', 'B2C', 'Shopify', 'Wildberries'].indexOf(platform) >= 0;
  }

  function supportsQuickAuth(platform) {
    return !isMiscOtherPlatform(platform);
  }

  function authOptionsForPlatform(platform) {
    if (platform === 'Amazon' || platform === 'TikTok Shop') {
      return ['store', 'ad'];
    }
    if (platform === 'Shopee') {
      return ['store', 'ad', 'affiliate'];
    }
    return ['store'];
  }

  function authTypeLabel(type) {
    if (type === 'ad') return '广告授权';
    if (type === 'affiliate') return '联盟授权';
    return '店铺授权';
  }

  function platformAuthJumpUrl(platform, authType) {
    var map = {
      Shopee: {
        store: 'https://open.shopee.com/auth',
        ad: 'https://open.shopee.com/ads/auth',
        affiliate: 'https://affiliate.shopee.com/auth'
      },
      Amazon: {
        store: 'https://sellercentral.amazon.com/apps/authorize',
        ad: 'https://advertising.amazon.com/ap/oa'
      },
      'TikTok Shop': {
        store: 'https://seller.tiktokglobalshop.com/account/permission',
        ad: 'https://ads.tiktok.com/ac/account/auth'
      },
      Lazada: { store: 'https://auth.lazada.com/oauth/authorize' },
      AliExpress: { store: 'https://oauth.aliexpress.com/authorize' },
      '1688': { store: 'https://auth.1688.com/oauth/authorize' },
      '淘宝': { store: 'https://oauth.taobao.com/authorize' },
      '天猫': { store: 'https://oauth.taobao.com/authorize' }
    };
    var platformMap = map[platform] || {};
    return platformMap[authType] || ('https://example.com/' + encodeURIComponent(platform) + '/' + authType + '-auth');
  }

  function closeRowAuthMenu() {
    var menu = $('rowAuthMenu');
    if (menu) menu.remove();
  }

  function supportsAdAuth(platform) {
    return platform === 'Amazon' || platform === 'Shopee' || platform === 'TikTok Shop';
  }

  function fillRowAuthMenu(menu, platform) {
    var options = authOptionsForPlatform(platform);

    menu.querySelectorAll('.action-menu-item').forEach(function(item) {
      var type = item.dataset.authType;
      var visible = options.indexOf(type) !== -1;
      item.hidden = !visible;
      item.disabled = false;
      item.classList.remove('is-disabled');
      item.title = '';
    });
  }

  function openRowAuthMenu(anchor, store) {
    closeRowAuthMenu();
    closeActionMenu();
    var menu = document.createElement('div');
    menu.id = 'rowAuthMenu';
    menu.className = 'row-auth-menu';
    menu.innerHTML =
      '<button type="button" class="action-menu-item" data-auth-type="store">店铺授权</button>' +
      '<button type="button" class="action-menu-item" data-auth-type="ad">广告授权</button>' +
      '<button type="button" class="action-menu-item" data-auth-type="affiliate">联盟授权</button>';
    fillRowAuthMenu(menu, store.platform);
    document.body.appendChild(menu);

    var rect = anchor.getBoundingClientRect();
    menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 12) + 'px';
    menu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12)) + 'px';

    menu.addEventListener('click', function(e) {
      var item = e.target.closest('.action-menu-item');
      if (!item || item.hidden || item.disabled) return;
      e.stopPropagation();
      closeRowAuthMenu();
      startQuickAuth(store, item.dataset.authType);
    });
  }

  function startQuickAuth(store, authType) {
    if (!store) return;
    if (!supportsQuickAuth(store.platform)) {
      toast(store.platform + ' 不支持立即授权', 'error');
      return;
    }

    var platform = store.platform;
    var allowed = authOptionsForPlatform(platform);
    if (authType === 'ad') {
      if (!supportsAdAuth(platform)) {
        toast(platform + ' 不支持广告授权', 'error');
        return;
      }
    } else if (authType === 'affiliate') {
      if (platform !== 'Shopee') {
        toast(platform + ' 不支持联盟授权', 'error');
        return;
      }
    } else if (allowed.indexOf(authType) === -1) {
      toast(platform + ' 不支持' + authTypeLabel(authType), 'error');
      return;
    }

    if (authType === 'store' && isTemuPlatform(platform)) {
      openDetail(store);
      activateDetailTab('auth');
      enterTemuAuthEdit(true);
      return;
    }
    if (authType === 'store' && isOzonPlatform(platform)) {
      openDetail(store);
      activateDetailTab('auth');
      enterOzonAuthEdit(true);
      return;
    }
    if (authType === 'store' && is1688Platform(platform)) {
      openDetail(store);
      activateDetailTab('auth');
      enterAlibabaAuthEdit(true);
      return;
    }

    var jumpUrl = platformAuthJumpUrl(platform, authType);
    var storeDesc = (store.alias || store.name) +
      (store.storeType ? '（' + displayStoreType(store.storeType) + '）' : '') +
      (store.mainAccountId ? ' · 主账号 ' + store.mainAccountId : '');

    var confirmed = confirm(
      '即将跳转 ' + platform + '「' + authTypeLabel(authType) + '」页面完成授权。\n\n' +
      '店铺：' + storeDesc + '\n' +
      '授权地址：' + jumpUrl + '\n\n' +
      '点击确定模拟授权成功。'
    );
    if (!confirmed) return;

    try {
      window.open(jumpUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {}

    if (authType === 'store') {
      if (platform === 'Shopee') {
        openReAuth(store);
        return;
      }
      store.authStatus = '已授权';
      store.authTime = formatNow();
      store.authExpire = nextYear();
      store.syncOrderTime = formatNow();
    } else if (authType === 'ad') {
      store.adAuthStatus = '已授权';
      if (platform === 'TikTok Shop') {
        renderTable();
        toast(platform + ' 广告授权成功');
        openAdSyncModal();
        return;
      }
    } else if (authType === 'affiliate') {
      store.affiliateAuthStatus = '已授权';
    }

    renderTable();
    toast(platform + '「' + authTypeLabel(authType) + '」授权成功');
  }

  function bindRowAuth() {
    document.addEventListener('click', function() {
      closeRowAuthMenu();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeRowAuthMenu();
    });
  }

  function enhanceSelects() {
    document.querySelectorAll('select.ant-select').forEach(function(select) {
      if (select.dataset.enhanced === 'true') return;
      select.dataset.enhanced = 'true';
      select.classList.add('native-hidden');

      var shell = document.createElement('div');
      shell.className = 'ant-select-shell';
      var trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'ant-select-trigger';
      var popup = document.createElement('div');
      popup.className = 'ant-select-popup';
      popup.hidden = true;

      function syncTrigger() {
        var option = select.options[select.selectedIndex];
        trigger.textContent = option ? option.textContent : '';
      }

      function renderOptions() {
        popup.innerHTML = '';
        Array.from(select.options).forEach(function(option) {
          var item = document.createElement('div');
          item.className = 'ant-select-option' + (option.value === select.value ? ' selected' : '');
          item.textContent = option.textContent;
          item.dataset.value = option.value;
          item.addEventListener('click', function() {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncTrigger();
            renderOptions();
            closePopup();
          });
          popup.appendChild(item);
        });
      }

      function closePopup() {
        popup.hidden = true;
        trigger.classList.remove('open');
      }

      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelectorAll('.ant-select-popup').forEach(function(other) {
          if (other !== popup) other.hidden = true;
        });
        document.querySelectorAll('.ant-select-trigger.open').forEach(function(other) {
          if (other !== trigger) other.classList.remove('open');
        });
        popup.hidden = !popup.hidden;
        trigger.classList.toggle('open', !popup.hidden);
      });
      select.addEventListener('change', function() {
        syncTrigger();
        renderOptions();
      });

      select.parentNode.insertBefore(shell, select.nextSibling);
      shell.appendChild(trigger);
      shell.appendChild(popup);
      syncTrigger();
      renderOptions();
    });

    document.addEventListener('click', function() {
      document.querySelectorAll('.ant-select-popup').forEach(function(popup) { popup.hidden = true; });
      document.querySelectorAll('.ant-select-trigger.open').forEach(function(trigger) { trigger.classList.remove('open'); });
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.ant-select-popup').forEach(function(popup) { popup.hidden = true; });
        document.querySelectorAll('.ant-select-trigger.open').forEach(function(trigger) { trigger.classList.remove('open'); });
      }
    });
  }

  function bindFilters() {
    $('btnSearch').addEventListener('click', renderTable);
    $('btnReset').addEventListener('click', function() {
      ['filterKeyword','filterOperator'].forEach(function(id){ $(id).value = ''; });
      ['filterBody','filterSite','filterStatus','filterAuth','filterMainAccount','filterSip','filterPlatformType','filterBU'].forEach(function(id){ $(id).value = '全部'; });
      ['filterBody','filterSite','filterStatus','filterAuth','filterMainAccount','filterSip','filterPlatformType','filterBU'].forEach(syncSelect);
      renderTable();
    });
    $('btnToggleAdvanced').addEventListener('click', function() {
      var fields = document.querySelectorAll('.advanced-field');
      var shouldShow = fields[0].hidden;
      fields.forEach(function(el){ el.hidden = !shouldShow; });
      this.textContent = shouldShow ? '收起高级筛选' : '展开高级筛选';
    });
  }

  function setBrowserEnumValue(nextValue) {
    if (nextValue && browserNameOptions.indexOf(nextValue) === -1) browserNameOptions.push(nextValue);
    $('editBrowserName').value = nextValue || '';
    $('browserEnumTrigger').textContent = nextValue || '请选择浏览器名称';
    renderBrowserEnumOptions();
  }

  function renderBrowserEnumOptions() {
    var current = $('editBrowserName').value;
    $('browserEnumOptions').innerHTML = browserNameOptions.map(function(name) {
      return '<div class="enum-option ' + (name === current ? 'selected' : '') + '" data-value="' + escapeHtml(name) + '">' +
        '<span>' + escapeHtml(name) + '</span>' +
        '<button class="enum-delete" data-delete="' + escapeHtml(name) + '" type="button">删除</button>' +
      '</div>';
    }).join('');
  }

  function bindBrowserEnumSelect() {
    $('browserEnumTrigger').addEventListener('click', function(e) {
      e.stopPropagation();
      $('browserEnumDropdown').hidden = !$('browserEnumDropdown').hidden;
      renderBrowserEnumOptions();
    });
    $('browserEnumOptions').addEventListener('click', function(e) {
      var deleteBtn = e.target.closest('[data-delete]');
      if (deleteBtn) {
        e.stopPropagation();
        var deleteValue = deleteBtn.dataset.delete;
        if (!confirm('确定删除浏览器名称「' + deleteValue + '」吗？\n\n删除后该选项将从下拉列表中移除。')) return;
        browserNameOptions = browserNameOptions.filter(function(name){ return name !== deleteValue; });
        if ($('editBrowserName').value === deleteValue) setBrowserEnumValue('');
        else renderBrowserEnumOptions();
        toast('浏览器名称枚举已删除');
        return;
      }
      var option = e.target.closest('.enum-option');
      if (!option) return;
      setBrowserEnumValue(option.dataset.value);
      $('browserEnumDropdown').hidden = true;
    });
    $('btnAddBrowserEnum').addEventListener('click', function(e) {
      e.stopPropagation();
      var nextValue = prompt('请输入新的浏览器名称');
      if (nextValue === null) return;
      nextValue = nextValue.trim();
      if (!nextValue) {
        toast('浏览器名称不能为空', 'error');
        return;
      }
      if (browserNameOptions.indexOf(nextValue) >= 0) {
        toast('该浏览器名称已存在', 'error');
        return;
      }
      browserNameOptions.push(nextValue);
      setBrowserEnumValue(nextValue);
      $('browserEnumDropdown').hidden = true;
      toast('浏览器名称枚举已添加');
    });
    document.addEventListener('click', function() {
      if ($('browserEnumDropdown')) $('browserEnumDropdown').hidden = true;
      document.querySelectorAll('.payment-platform-dropdown').forEach(function(dropdown) {
        dropdown.hidden = true;
      });
    });
  }

  function setPaymentPlatformValue(row, nextValue) {
    if (nextValue && paymentPlatformOptions.indexOf(nextValue) === -1) paymentPlatformOptions.push(nextValue);
    row.querySelector('.payment-platform').value = nextValue || '';
    row.querySelector('.payment-platform-trigger').textContent = nextValue || '请选择收款平台';
    renderPaymentPlatformOptions(row);
  }

  function renderPaymentPlatformOptions(row) {
    var current = row.querySelector('.payment-platform').value;
    row.querySelector('.payment-platform-options').innerHTML = paymentPlatformOptions.map(function(name) {
      return '<div class="enum-option ' + (name === current ? 'selected' : '') + '" data-value="' + escapeHtml(name) + '">' +
        '<span>' + escapeHtml(name) + '</span>' +
        '<button class="enum-delete" data-delete="' + escapeHtml(name) + '" type="button">删除</button>' +
      '</div>';
    }).join('');
  }

  function bindPaymentPlatformEnum(row) {
    var trigger = row.querySelector('.payment-platform-trigger');
    var dropdown = row.querySelector('.payment-platform-dropdown');
    var options = row.querySelector('.payment-platform-options');
    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.payment-platform-dropdown').forEach(function(item) {
        if (item !== dropdown) item.hidden = true;
      });
      dropdown.hidden = !dropdown.hidden;
      renderPaymentPlatformOptions(row);
    });
    dropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    options.addEventListener('click', function(e) {
      var deleteBtn = e.target.closest('[data-delete]');
      if (deleteBtn) {
        var deleteValue = deleteBtn.dataset.delete;
        if (!confirm('确定删除收款平台「' + deleteValue + '」吗？\n\n删除后该选项将从下拉列表中移除。')) return;
        paymentPlatformOptions = paymentPlatformOptions.filter(function(name){ return name !== deleteValue; });
        document.querySelectorAll('.payment-edit-row').forEach(function(item) {
          if (item.querySelector('.payment-platform').value === deleteValue) setPaymentPlatformValue(item, '');
          else renderPaymentPlatformOptions(item);
        });
        toast('收款平台枚举已删除');
        return;
      }
      var option = e.target.closest('.enum-option');
      if (!option) return;
      setPaymentPlatformValue(row, option.dataset.value);
      dropdown.hidden = true;
    });
    row.querySelector('.payment-platform-add').addEventListener('click', function(e) {
      e.stopPropagation();
      var nextValue = prompt('请输入新的收款平台');
      if (nextValue === null) return;
      nextValue = nextValue.trim();
      if (!nextValue) {
        toast('收款平台不能为空', 'error');
        return;
      }
      if (paymentPlatformOptions.indexOf(nextValue) >= 0) {
        toast('该收款平台已存在', 'error');
        return;
      }
      paymentPlatformOptions.push(nextValue);
      setPaymentPlatformValue(row, nextValue);
      dropdown.hidden = true;
      toast('收款平台枚举已添加');
    });
    setPaymentPlatformValue(row, row.querySelector('.payment-platform').value);
  }

  function bindSelection() {
    $('selectAll').addEventListener('change', function() {
      if (this.checked) {
        filteredStores.forEach(function(s){ selectedIds.add(s.id); });
      } else {
        filteredStores.forEach(function(s){ selectedIds.delete(s.id); });
      }
      renderTable();
    });

    $('storeTableBody').addEventListener('change', function(e) {
      if (e.target.classList.contains('store-status-toggle')) {
        var enabled = !!e.target.checked;
        var storeId = parseInt(e.target.dataset.id, 10);
        var targetStore = window.STORE_DATA.find(function(s){ return s.id === storeId; });
        applyStoreEnabled(targetStore, enabled);
        renderTable();
        if (currentStore) {
          var refreshed = window.STORE_DATA.find(function(s){ return s.id === currentStore.id; });
          if (refreshed) {
            currentStore = refreshed;
            var detailDrawer = $('drawerDetail');
            if (detailDrawer && !detailDrawer.hidden) openDetail(currentStore);
          }
        }
        var aliasLabel = (targetStore && (targetStore.alias || targetStore.name)) || '';
        toast(aliasLabel
          ? ('店铺「' + aliasLabel + '」' + (enabled ? '已启用' : '已关闭'))
          : (enabled ? '店铺已启用' : '店铺已关闭'));
        return;
      }
      if (e.target.classList.contains('temu-group-checkbox')) {
        var groupKey = e.target.dataset.temuGroup;
        filteredStores.forEach(function(s) {
          if (!isTemuPlatform(s.platform) || getTemuGroupKey(s) !== groupKey) return;
          if (e.target.checked) selectedIds.add(s.id);
          else selectedIds.delete(s.id);
        });
        renderTable();
        return;
      }
      if (!e.target.classList.contains('row-checkbox')) return;
      var id = parseInt(e.target.dataset.id, 10);
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      $('selectedCount').textContent = '已选 ' + selectedIds.size + ' 项';
      $('btnBatchDelete').disabled = selectedIds.size === 0;
      $('btnBatchDownloadPayment').disabled = selectedIds.size === 0;
      var row = e.target.closest('tr');
      var gKey = row && row.dataset.temuGroup;
      if (gKey) {
        var groupStores = filteredStores.filter(function(s) {
          return isTemuPlatform(s.platform) && getTemuGroupKey(s) === gKey;
        });
        var groupCb = document.querySelector('.temu-group-checkbox[data-temu-group="' + gKey.replace(/"/g, '') + '"]');
        if (groupCb) {
          groupCb.checked = groupStores.length > 0 && groupStores.every(function(s){ return selectedIds.has(s.id); });
        }
      }
    });
  }

  function bindRowActions() {
    $('storeTableBody').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-op]');
      if (!btn) return;
      e.stopPropagation();
      var store = window.STORE_DATA.find(function(s){ return s.id === parseInt(btn.dataset.id, 10); });
      if (!store) return;
      if (btn.dataset.op === '详情') openDetail(store);
      if (btn.dataset.op === '编辑') {
        openDetail(store);
        openEditBasic(store, 'detail');
      }
      if (btn.dataset.op === '立即授权') openRowAuthMenu(btn, store);
      if (btn.dataset.op === '子店铺') openChildStores(store);
      if (btn.dataset.op === '更多') openRowMoreMenu(btn, store);
    });
    document.addEventListener('click', closeActionMenu);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeActionMenu();
    });
  }

  function openChildStores(store) {
    var children = getRelatedChildren(store);
    $('drawerChildStores').hidden = false;
    $('childParentAlias').textContent = store.alias || store.name || '—';
    $('childStoreSummary').textContent = '当前全球店主账号共关联 ' + children.length + ' 个子店铺，子店铺的授权 Token 随主账号统一刷新。';
    $('childStoreRows').innerHTML = children.length ? children.map(function(child) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(child.alias || '—') + '</strong></td>' +
        '<td>' + tagHtml(child.site || '—', 'tag-blue') + '</td>' +
        '<td><span class="status-dot"></span> ' + (child.authStatus || '成功') + '</td>' +
        '<td><button class="table-action-link" type="button">详情</button></td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="4" class="empty-cell">暂无关联子店铺</td></tr>';
  }

  function closeActionMenu() {
    var menu = $('rowActionMenu');
    if (menu) menu.remove();
  }

  function openRowMoreMenu(anchor, store) {
    closeActionMenu();
    closeRowAuthMenu();
    var menu = document.createElement('div');
    menu.id = 'rowActionMenu';
    menu.className = 'row-action-menu';
    menu.innerHTML =
      '<button data-menu-op="download-payment" type="button">下载收款信息</button>' +
      '<button data-menu-op="sync-setting" type="button">同步设置</button>' +
      '<button data-menu-op="log" type="button">查看操作日志</button>' +
      '<button data-menu-op="delete" class="danger" type="button">删除</button>';
    document.body.appendChild(menu);

    var rect = anchor.getBoundingClientRect();
    menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 12) + 'px';
    menu.style.left = Math.max(12, rect.right - menu.offsetWidth) + 'px';

    menu.addEventListener('click', function(e) {
      var item = e.target.closest('[data-menu-op]');
      if (!item) return;
      handleMoreAction(item.dataset.menuOp, store);
      closeActionMenu();
    });
  }

  function handleMoreAction(op, store) {
    currentStore = store;
    normalizeStore(store);
    if (op === 'download-payment') {
      downloadPaymentInfo([store]);
      return;
    }
    if (op === 'sync-setting') {
      toast('同步设置包含订单同步、库存同步与广告数据更新频率');
      return;
    }
    if (op === 'log') {
      openDetail(store);
      activateDetailTab('log');
      return;
    }
    if (op === 'delete') {
      var confirmed = confirm('确认删除店铺「' + (store.alias || store.name) + '」吗？\n\n删除后仅移除 ERP 店铺记录，不会取消平台授权。');
      if (!confirmed) return;
      window.STORE_DATA = window.STORE_DATA.filter(function(s){ return s.id !== store.id; });
      selectedIds.delete(store.id);
      renderTable();
      toast('店铺记录已删除');
    }
  }

  function storeTypeLabel(storeType) {
    return storeType === 'global' ? '全球' : '本土';
  }

  function isGlobalStoreType(storeType) {
    return storeType === 'global' || ['全球', '跨境店（CNSC）', '3PF', 'KRSC'].indexOf(storeType) >= 0;
  }

  function displayStoreType(storeType) {
    if (!storeType) return '—';
    if (storeType === '全托管' || storeType === '半托管') return storeType;
    if (storeType === '跨境' || storeType === '本土' || storeType === '全球') return storeType;
    return isGlobalStoreType(storeType) ? '全球' : '本土';
  }

  function platformRequiresManualShopMeta(platform) {
    return ['Amazon', 'AliExpress', 'Temu', 'Ozon', '淘宝', '天猫', '京东', '抖音', '美客多', '沃尔玛', 'Wish', '阿里巴巴国际', 'B2C', 'Shopify', 'Wildberries'].indexOf(platform) >= 0;
  }

  function updateCreatePlatformFields() {
    var platform = $('selectPlatform') ? $('selectPlatform').value : '';
    var manualMeta = platformRequiresManualShopMeta(platform);
    ['inputShopId', 'inputShopName'].forEach(function(id) {
      var input = $(id);
      input.disabled = !manualMeta;
      input.placeholder = manualMeta ? '请输入' + (id === 'inputShopId' ? '后台店铺ID' : '后台店铺名称') : '授权后系统自动录入';
      if (!manualMeta) input.value = '';
    });
    document.querySelectorAll('.platform-add-tiktok').forEach(function(el) {
      el.hidden = platform !== 'TikTok Shop';
    });
  }

  function updateEditCreatePlatformFields() {
    var platform = creatingBasicStore ? value('editPlatformSelect') : (currentStore ? currentStore.platform : '');
    var manualMeta = platformRequiresManualShopMeta(platform);
    ['editShopId', 'editShopName'].forEach(function(id) {
      var input = $(id);
      input.disabled = creatingBasicStore && !manualMeta;
      input.placeholder = creatingBasicStore && !manualMeta
        ? '授权后系统自动录入'
        : '请输入' + (id === 'editShopId' ? '后台店铺ID' : '后台店铺名称');
      if (creatingBasicStore && !manualMeta) input.value = '';
    });
    document.querySelectorAll('.platform-edit-tiktok').forEach(function(el) {
      el.hidden = platform !== 'TikTok Shop';
    });
    document.querySelectorAll('.platform-edit-shopee').forEach(function(el) {
      el.hidden = platform !== 'Shopee';
    });
    document.querySelectorAll('.platform-edit-temu').forEach(function(el) {
      el.hidden = platform !== 'Temu';
    });
    syncStoreTypeOptions(platform, creatingBasicStore ? value('editStoreType') : (currentStore ? currentStore.storeType : ''));
    syncIsMallField(platform, creatingBasicStore ? (value('editIsMall') || '') : (currentStore ? currentStore.isMall : ''));
    syncSiteFieldVisibility(platform);
  }

  function bindCreateStore() {
    $('btnAddStore').addEventListener('click', function() {
      var draft = createEmptyDraftStore();
      openDetail(draft);
      openEditBasic(draft, 'create');
    });

    $('btnCloseShopeeAuthResult').addEventListener('click', closeShopeeAuthResult);
    $('btnCancelShopeeAuthResult').addEventListener('click', closeShopeeAuthResult);
    $('btnConfirmShopeeAuthResult').addEventListener('click', confirmShopeeAuthResult);
    $('btnCloseChildStores').addEventListener('click', function(){ $('drawerChildStores').hidden = true; });
  }

  function openShopeeAuthResult(nickname, typeLabel, storeType, sourceStore) {
    var isSip = storeType === '3pf' || storeType === '3PF';
    pendingShopeeSourceStore = sourceStore || null;
    var mainAccountId = sourceStore && sourceStore.mainAccountId ? sourceStore.mainAccountId : 'main_acct_10888:main';
    var mainPlatformName = sourceStore && sourceStore.platformShopName ? sourceStore.platformShopName : 'YYH_Global_Main';
    var mainAlias = sourceStore && sourceStore.alias ? sourceStore.alias : nickname;
    pendingShopeeAssets = [
      { platformName: mainPlatformName, site: '全球', role: '主账号', alias: mainAlias, typeLabel: typeLabel, authType: 'main_account', mainAccountId: mainAccountId, isSip: isSip },
      { platformName: 'YYH_SG_Shop', site: '新加坡', role: '子店铺', alias: '', typeLabel: typeLabel, authType: 'main_account', mainAccountId: mainAccountId, isSip: isSip },
      { platformName: 'YYH_PH_Shop', site: '菲律宾', role: '子店铺', alias: '', typeLabel: typeLabel, authType: 'main_account', mainAccountId: mainAccountId, isSip: isSip }
    ];
    if ($('modalAddStore')) $('modalAddStore').hidden = true;
    $('modalReAuth').hidden = true;
    $('drawerDetail').hidden = true;
    $('modalShopeeAuthResult').hidden = false;
    $('aliasError').hidden = true;
    $('shopeeAssetCount').textContent = pendingShopeeAssets.length;
    renderShopeeAuthRows();
  }

  function renderShopeeAuthRows() {
    $('shopeeAuthAssetRows').innerHTML = pendingShopeeAssets.map(function(asset, index) {
      return '<tr>' +
        '<td><strong>' + asset.platformName + '</strong> <span class="tag ' + (asset.role === '主账号' ? 'tag-blue' : 'tag-gray') + '">' + asset.role + '</span></td>' +
        '<td><span class="tag tag-blue">' + asset.site + '</span></td>' +
        '<td><input class="form-input alias-input" data-index="' + index + '" value="' + escapeHtml(asset.alias || '') + '" placeholder="如：云易盒全球店" /></td>' +
      '</tr>';
    }).join('');
  }

  function closeShopeeAuthResult() {
    $('modalShopeeAuthResult').hidden = true;
    pendingShopeeAssets = [];
    pendingShopeeSourceStore = null;
    toast('已取消本次 Shopee 授权录入');
  }

  function confirmShopeeAuthResult() {
    var hasMissing = false;
    document.querySelectorAll('.alias-input').forEach(function(input) {
      var alias = input.value.trim();
      pendingShopeeAssets[Number(input.dataset.index)].alias = alias;
      input.classList.toggle('input-error', !alias);
      if (!alias) hasMissing = true;
    });
    $('aliasError').hidden = !hasMissing;
    if (hasMissing) {
      toast('请先补充所有店铺系统别名', 'error');
      return;
    }
    var mainAsset = pendingShopeeAssets.find(function(asset) { return asset.role === '主账号'; });
    var childAssets = pendingShopeeAssets.filter(function(asset) { return asset.role === '子店铺'; });
    var mainStore = pendingShopeeSourceStore || createShopeeStore(mainAsset.alias, mainAsset.typeLabel, mainAsset.authType, mainAsset.site, mainAsset.mainAccountId, mainAsset.isSip, mainAsset.platformName, mainAsset.role);
    mainStore.alias = mainAsset.alias;
    mainStore.storeType = mainAsset.typeLabel;
    mainStore.authType = mainAsset.authType;
    mainStore.mainAccountId = mainAsset.mainAccountId;
    mainStore.platformShopName = mainAsset.platformName;
    mainStore.authStatus = '已授权';
    mainStore.authTime = formatNow();
    mainStore.authExpire = nextYear();
    mainStore.syncOrderTime = formatNow();
    mainStore.relationRole = 'main';
    mainStore.childStores = childAssets.map(function(asset) {
      return { alias: asset.alias, site: asset.site, authStatus: '成功' };
    });
    mainStore.relatedStores = childAssets.map(function(asset) { return asset.alias; });
    mainStore.unrecordedStores = 0;
    var childStores = childAssets.map(function(asset) {
      var childStore = createShopeeStore(asset.alias, asset.typeLabel, asset.authType, asset.site, null, asset.isSip, asset.platformName, asset.role);
      childStore.relationRole = 'child';
      childStore.parentMainAccountId = mainAsset.mainAccountId;
      childStore.parentAlias = mainAsset.alias;
      childStore.relatedStores = [];
      childStore.unrecordedStores = 0;
      return childStore;
    });
    var created = pendingShopeeSourceStore ? childStores : [mainStore].concat(childStores);
    window.STORE_DATA = created.concat(window.STORE_DATA);
    $('modalShopeeAuthResult').hidden = true;
    pendingShopeeAssets = [];
    pendingShopeeSourceStore = null;
    renderTable();
    openPostAuthPermission(created);
    toast('Shopee 授权成功，请继续设置店铺用户权限');
  }

  function createShopeeStore(alias, storeType, authType, site, mainAccountId, isSip, platformName, role) {
    var maxId = Math.max.apply(null, window.STORE_DATA.map(function(s){ return s.id; }));
    var now = formatNow();
    return {
      id: maxId + Math.floor(Math.random() * 10000) + 1,
      platform: 'Shopee',
      name: 'Shopee ' + site + ' Store',
      alias: alias,
      body: value('inputRegistrationSubject'),
      subName: role === '子店铺' ? platformName : '—',
      site: site,
      region: '',
      storeType: storeType,
      platformStoreType: '普通店铺',
      bu: '待分配',
      status: '启用',
      authStatus: '已授权',
      authTime: now,
      authExpire: nextYear(),
      authType: authType,
      mainAccountId: mainAccountId,
      isSip: !!isSip,
      isMall: false,
      syncOrderTime: now,
      operator: '待分配',
      cs: '待分配',
      platformShopId: String(40000 + Math.floor(Math.random()*10000)),
      platformShopName: platformName || ('Shop ' + site),
      merchantId: mainAccountId ? 'merchant_' + (1000000 + Math.floor(Math.random()*100000)) : null,
      useStatus: '正常使用',
      enabled: true,
      cancelDate: null,
      dept: '待分配',
      owner: '待分配',
      browserName: value('inputBrowserName'),
      browserStoreName: value('inputBrowserStore'),
      accountType: value('inputAccountType'),
      registrationType: value('inputRegistrationType'),
      registrationCompany: value('inputRegistrationSubject'),
      registrationCode: principalCode(value('inputRegistrationSubject')),
      registrationDate: principalEnterpriseRegistrationTime(value('inputRegistrationSubject')),
      fundPlatform: '',
      fundAccount: '',
      fundAccountRaw: '',
      fundAccountId: '',
      aeFreightAlipay: '',
      hasDeposit: false,
      depositRefundStatus: '无需退回',
      depositAccount: '',
      depositAccountRaw: '',
      depositAmount: '',
      depositRefundTime: '',
      depositRefundTransactionId: '',
      remarks: '授权后自动录入。',
      adAuthStatus: '未授权',
      affiliateAuthStatus: '未授权',
      relatedStores: [],
      unrecordedStores: 0,
      storeEmail: value('inputStoreEmail'),
      adAccountId: value('inputAdAccountId'),
      bcId: value('inputBcId'),
      paymentAccounts: [],
      bodyChangeRecords: [],
      paymentChangeRecords: [],
      permissions: [],
      permissionUsers: [],
      adSyncSetting: null,
      ops: ['详情', '编辑', '授权', '更多']
    };
  }

  function createEmptyDraftStore() {
    return {
      id: Date.now(),
      _draft: true,
      platform: '',
      name: '',
      alias: '',
      body: '',
      site: '',
      storeType: '',
      platformStoreType: '—',
      status: '未启用',
      authStatus: '未授权',
      authTime: '—',
      authExpire: '—',
      syncOrderTime: '—',
      enabled: false,
      useStatus: '待启用',
      storeEmail: '',
      isMall: false,
      registrationCompany: '',
      paymentAccounts: [],
      permissions: [],
      permissionUsers: [],
      bodyChangeRecords: [],
      paymentChangeRecords: [],
      remarks: '店铺资料待完善。'
    };
  }

  function openPostAuthPermission(stores) {
    pendingPermissionStores = (stores || []).filter(Boolean);
    if (!pendingPermissionStores.length) return;
    $('postAuthStoreCount').textContent = pendingPermissionStores.length;
    $('postAuthStoreList').innerHTML = pendingPermissionStores.map(function(store) {
      return '<div class="permission-store-item">' +
        '<strong>' + escapeHtml(store.alias || store.name) + '</strong>' +
        '<span><span class="tag tag-blue">' + escapeHtml(store.platform || 'Shopee') + '</span>' + (supportsSiteField(store.platform) && store.site ? (' ' + escapeHtml(store.site)) : '') + '</span>' +
      '</div>';
    }).join('');
    document.querySelectorAll('.permission-user-check').forEach(function(input, index) {
      input.checked = index === 0;
    });
    document.querySelectorAll('.post-auth-permission-check').forEach(function(input) {
      input.checked = input.value === '订单查看';
    });
    $('modalPostAuthPermission').hidden = false;
  }

  function closePostAuthPermission(message) {
    $('modalPostAuthPermission').hidden = true;
    pendingPermissionStores = [];
    if (message) toast(message);
  }

  function bindPostAuthPermission() {
    ['btnClosePostAuthPermission', 'btnSkipPostAuthPermission'].forEach(function(id) {
      $(id).addEventListener('click', function() {
        closePostAuthPermission('已跳过权限设置，可在店铺列表批量设置部门/人员');
      });
    });
    $('btnSavePostAuthPermission').addEventListener('click', function() {
      var users = Array.from(document.querySelectorAll('.permission-user-check:checked')).map(function(input) { return input.value; });
      var permissions = Array.from(document.querySelectorAll('.post-auth-permission-check:checked')).map(function(input) { return input.value; });
      if (!users.length) {
        toast('请先选择需要授权的用户', 'error');
        return;
      }
      if (!permissions.length) {
        toast('请至少选择一个店铺权限', 'error');
        return;
      }
      pendingPermissionStores.forEach(function(store) {
        store.permissionUsers = users.slice();
        store.permissions = permissions.slice();
      });
      closePostAuthPermission('已为本次授权店铺批量设置用户权限');
    });
  }

  function renderSensitive(store) {
    renderPaymentList(store);
    var ae = $('aeFreightAlipay');
    if (ae) ae.textContent = sensitiveUnlocked ? (store.aeFreightAlipay || '—') : (store.aeFreightAlipay ? '**** ****' : '—');
    $('depositAccount').textContent = sensitiveUnlocked ? (store.depositAccountRaw || '—') : (store.depositAccount || '—');
    $('sensitiveBar').textContent = sensitiveUnlocked ? '当前已解锁资金信息查看权限' : '当前为脱敏查看模式';
    $('sensitiveBar').classList.toggle('unlocked', sensitiveUnlocked);
    $('btnUnlockSensitive').hidden = sensitiveUnlocked;
    $('btnLockSensitive').hidden = !sensitiveUnlocked;
  }

  function renderPaymentList(store) {
    var accounts = store.paymentAccounts || [];
    $('paymentList').innerHTML = accounts.length ? accounts.map(function(account, index) {
      var accountText = sensitiveUnlocked ? (account.accountRaw || account.account || '—') : (account.account || maskAccount(account.accountRaw));
      return '<div class="payment-item">' +
        '<strong>' + (account.platform || '—') + '</strong>' +
        '<span class="sensitive-value">' + accountText + '</span>' +
        '<span>' + (account.accountId || '—') + '</span>' +
        '<span class="tag">' + (account.currency || 'USD') + '</span>' +
      '</div>';
    }).join('') : '<div class="payment-item"><span>暂无收款账号</span></div>';
  }

  function maskAccount(raw) {
    if (!raw) return '—';
    return '**** **** ' + raw.slice(-4);
  }

  function renderRecords(id, records, emptyText) {
    $(id).innerHTML = records && records.length ? '<div class="record-list">' + records.map(function(record) {
      var content = record.content || ((record.from || '—') + ' → ' + (record.to || '—'));
      return '<div class="record-item"><strong>' + record.time + ' · ' + record.operator + '</strong>' + content + '</div>';
    }).join('') + '</div>' : '<div class="record-item">' + emptyText + '</div>';
  }

  function openDetail(store) {
    normalizeStore(store);
    currentStore = store;
    sensitiveUnlocked = false;
    $('drawerDetail').hidden = false;
    $('detailDrawerTitle').textContent = store._draft ? '新增店铺' : '店铺详情';
    $('detailName').textContent = store.name || '—';
    $('detailSite').textContent = supportsSiteField(store.platform) ? (store.site || '—') : '';
    if ($('detailSiteItem')) $('detailSiteItem').hidden = !supportsSiteField(store.platform);
    $('detailPlatform').textContent = store.platform || '—';

    var statusTag = $('detailStatus');
    statusTag.textContent = store.status || '—';
    statusTag.className = 'tag ' + (store.status === '启用' ? 'tag-green' : 'tag-gray');

    var authInfo = tagForAuth(store.authStatus);
    var authTag = $('detailAuthStatus');
    authTag.textContent = authInfo.text;
    authTag.className = 'tag ' + authInfo.tag;

    $('basicAlias').textContent = store.alias || '—';
    $('basicPlatform').textContent = store.platform || '—';
    $('basicShopId').textContent = store.platformShopId || '—';
    $('basicShopName').textContent = store.platformShopName || '—';
    $('basicEmail').textContent = store.storeEmail || '—';
    $('basicSite').textContent = supportsSiteField(store.platform) ? (store.site || '—') : '';
    if ($('basicSiteItem')) $('basicSiteItem').hidden = !supportsSiteField(store.platform);
    $('basicType').textContent = displayStoreType(store.storeType);
    $('basicTypeItem').hidden = hidesStoreType(store.platform);
    $('basicMainAcct').textContent = store.mainAccountId || '否';
    $('basicSip').textContent = store.isSip ? '是' : '否';
    $('basicIsMall').textContent = store.isMall ? '是' : '否';
    $('basicAdAccountId').textContent = store.platform === 'TikTok Shop' ? (store.adAccountId || '—') : '—';
    $('basicBcId').textContent = store.platform === 'TikTok Shop' ? (store.bcId || '—') : '—';
    document.querySelectorAll('.platform-detail-shopee').forEach(function(el){ el.hidden = store.platform !== 'Shopee'; });
    document.querySelectorAll('.platform-detail-tiktok').forEach(function(el){ el.hidden = store.platform !== 'TikTok Shop'; });
    $('basicBrowserName').textContent = store.browserName || '—';
    $('basicBrowserStore').textContent = store.browserStoreName || '—';
    $('basicAccountType').textContent = store.accountType || '—';
    $('basicRegistrationType').textContent = store.registrationType || '—';
    $('basicRegistrationCompany').textContent = store.registrationCompany || '—';
    $('basicRegistrationCode').textContent = store.registrationCode || principalCode(store.registrationCompany);
    $('basicRegistrationDate').textContent = principalEnterpriseRegistrationTime(store.registrationCompany) || store.registrationDate || '—';

    $('bizDept').textContent = store.dept || '—';
    $('bizOwner').textContent = store.owner || '—';
    $('bizUseStatus').textContent = store.useStatus || '—';
    $('bizCancelDate').textContent = store.cancelDate || '—';
    $('bizOperator').textContent = store.operator || '—';
    $('bizCs').textContent = store.cs || '—';
    $('bizBu').textContent = store.bu || '—';
    $('depositHas').textContent = store.hasDeposit ? '是' : '否';
    $('depositRefundStatus').textContent = store.depositRefundStatus || '—';
    $('depositAmount').textContent = store.depositAmount ? '¥' + store.depositAmount : '—';
    $('depositRefundTime').textContent = store.depositRefundTime || '—';
    $('depositRefundTransactionId').textContent = store.depositRefundTransactionId || '—';
    $('bizRemarks').textContent = store.remarks || '—';
    renderRecords('bodyChangeRecords', store.bodyChangeRecords, '暂无注册主体变更记录');
    renderRecords('paymentChangeRecords', store.paymentChangeRecords, '暂无收款信息变更记录');
    renderSensitive(store);

    var authStatusEl = $('authStatus');
    authStatusEl.textContent = authInfo.text;
    authStatusEl.className = 'tag ' + authInfo.tag;
    $('authTime').textContent = store.authTime || '—';
    $('authExpire').textContent = store.authExpire || '—';
    $('authMainAccount').textContent = store.mainAccountId || '—';
    $('authRemain').textContent = remainDays(store.authExpire);

    var isTemu = isTemuPlatform(store.platform);
    var isOzon = isOzonPlatform(store.platform);
    var is1688 = is1688Platform(store.platform);
    $('temuAuthCard').hidden = !isTemu;
    $('alibabaAuthCard').hidden = !is1688;
    $('genericAuthCard').hidden = isOzon || isTemu || is1688;
    $('ozonAuthCard').hidden = !isOzon;
    if (isTemu) {
      authOrderTokenRegion = 'us';
      renderTemuAuthSummary(store);
      if (store._pendingTemuAuthHighlight) {
        enterTemuAuthEdit(true);
        store._pendingTemuAuthHighlight = false;
      } else {
        setTemuAuthViewMode();
      }
    } else {
      temuAuthEditing = false;
      temuAuthHighlight = false;
      editOrderTokenDraft = null;
    }
    if (isOzon) {
      renderOzonAuthSummary(store);
      if (store._pendingOzonAuthHighlight) {
        enterOzonAuthEdit(true);
        store._pendingOzonAuthHighlight = false;
      } else {
        setOzonAuthViewMode();
      }
    } else {
      ozonAuthEditing = false;
      ozonAuthHighlight = false;
    }
    if (is1688) {
      renderAlibabaAuthSummary(store);
      if (store._pendingAlibabaAuthHighlight) {
        enterAlibabaAuthEdit(true);
        store._pendingAlibabaAuthHighlight = false;
      } else {
        setAlibabaAuthViewMode();
      }
    } else {
      alibabaAuthEditing = false;
      alibabaAuthHighlight = false;
    }

    renderRelatedStores(store);
    renderOperationLogs(store);
    activateDetailTab('basic');
  }

  function shouldShowOzonAuthTip(store) {
    if (!store || !isOzonPlatform(store.platform)) return false;
    ensureOzonAuth(store);
    if (store.ozonAuthEdited) return false;
    return !store.clientId && !store.apiKey;
  }

  function syncOzonAuthChrome() {
    var saveBtn = $('btnOzonAuthSave');
    var editBtn = $('btnOzonAuthEdit');
    if (saveBtn) saveBtn.hidden = !ozonAuthEditing;
    if (editBtn) editBtn.hidden = ozonAuthEditing;
    var showTip = currentStore ? shouldShowOzonAuthTip(currentStore) : false;
    var tip = $('ozonAuthTip');
    if (tip) tip.hidden = !showTip;
    var card = $('ozonAuthCard');
    if (card) {
      card.classList.toggle('is-highlight', showTip);
      card.classList.toggle('is-editing', ozonAuthEditing);
    }
    document.querySelectorAll('.ozon-auth-input').forEach(function(input) {
      input.classList.toggle('is-highlight', ozonAuthEditing);
    });
  }

  function renderOzonAuthSummary(store) {
    ensureOzonAuth(store);
    var authInfo = tagForAuth(store.authStatus);
    var statusEl = $('ozonAuthStatus');
    statusEl.textContent = authInfo.text;
    statusEl.className = 'tag ' + authInfo.tag;
    $('ozonAuthTime').textContent = store.authTime || '—';
    $('ozonAuthExpire').textContent = store.authExpire || '—';
    $('ozonAuthRemain').textContent = remainDays(store.authExpire);
    $('ozonAuthMainAccount').textContent = store.mainAccountId || '—';
    $('viewOzonClientId').textContent = store.clientId || '—';
    $('viewOzonApiKey').textContent = store.apiKey || '—';
    $('inlineOzonClientId').value = store.clientId || '';
    $('inlineOzonApiKey').value = store.apiKey || '';
    syncOzonAuthChrome();
  }

  function setOzonAuthHighlight(on) {
    ozonAuthHighlight = !!on;
    syncOzonAuthChrome();
  }

  function setOzonAuthViewMode() {
    ozonAuthEditing = false;
    ozonAuthHighlight = false;
    $('inlineOzonClientId').hidden = true;
    $('inlineOzonApiKey').hidden = true;
    $('inlineOzonClientId').disabled = true;
    $('inlineOzonApiKey').disabled = true;
    $('viewOzonClientId').hidden = false;
    $('viewOzonApiKey').hidden = false;
    if (currentStore) renderOzonAuthSummary(currentStore);
    else syncOzonAuthChrome();
  }

  function enterOzonAuthEdit(withHighlight) {
    if (!currentStore || !isOzonPlatform(currentStore.platform)) return;
    ensureOzonAuth(currentStore);
    ozonAuthEditing = true;
    ozonAuthHighlight = !!withHighlight && shouldShowOzonAuthTip(currentStore);
    $('inlineOzonClientId').hidden = false;
    $('inlineOzonApiKey').hidden = false;
    $('inlineOzonClientId').disabled = false;
    $('inlineOzonApiKey').disabled = false;
    $('viewOzonClientId').hidden = true;
    $('viewOzonApiKey').hidden = true;
    $('inlineOzonClientId').value = currentStore.clientId || '';
    $('inlineOzonApiKey').value = currentStore.apiKey || '';
    syncOzonAuthChrome();
    $('inlineOzonClientId').focus();
  }

  function saveOzonAuthInline() {
    if (!currentStore || !isOzonPlatform(currentStore.platform)) return;
    ensureOzonAuth(currentStore);
    var clientId = value('inlineOzonClientId').slice(0, OZON_CLIENT_ID_MAX);
    var apiKey = value('inlineOzonApiKey').slice(0, OZON_API_KEY_MAX);
    if (clientId && !/^\d+$/.test(clientId)) {
      toast('Client ID 应为数字，最长 ' + OZON_CLIENT_ID_MAX + ' 位', 'error');
      return;
    }
    if (apiKey.length > OZON_API_KEY_MAX) {
      toast('API Key 最长 ' + OZON_API_KEY_MAX + ' 位', 'error');
      return;
    }
    var oldClientId = currentStore.clientId || '';
    var oldApiKey = currentStore.apiKey || '';
    var oldAuthStatus = currentStore.authStatus || '未授权';
    var oldAuthTime = currentStore.authTime || '—';
    var oldAuthExpire = currentStore.authExpire || '—';
    currentStore.clientId = clientId;
    currentStore.apiKey = apiKey;
    currentStore.ozonAuthEdited = true;
    applyOzonAuthFromTokens(currentStore);

    var changes = [];
    if (oldClientId !== clientId) changes.push('Client ID：' + formatLogValue(oldClientId) + ' → ' + formatLogValue(clientId));
    if (oldApiKey !== apiKey) changes.push('API Key：' + formatLogValue(oldApiKey) + ' → ' + formatLogValue(apiKey));
    if (oldAuthStatus !== currentStore.authStatus) changes.push('授权状态：' + formatLogValue(oldAuthStatus) + ' → ' + formatLogValue(currentStore.authStatus));
    if (oldAuthTime !== (currentStore.authTime || '—')) changes.push('授权时间：' + formatLogValue(oldAuthTime) + ' → ' + formatLogValue(currentStore.authTime));
    if (oldAuthExpire !== (currentStore.authExpire || '—')) changes.push('过期时间：' + formatLogValue(oldAuthExpire) + ' → ' + formatLogValue(currentStore.authExpire));
    if (changes.length) {
      pushOperationLog(currentStore, '授权', '编辑', changes.join('；'));
    } else {
      pushOperationLog(currentStore, '授权', '编辑', '授权信息保存，字段无变更');
    }

    renderTable();
    renderOzonAuthSummary(currentStore);
    setOzonAuthViewMode();
    renderOperationLogs(currentStore);
    toast(storeHasOzonAuth(currentStore) ? '授权信息保存成功，已更新授权状态' : '授权信息已保存（未填写凭证，保持未授权）');
  }

  function shouldShowAlibabaAuthTip(store) {
    if (!store || !is1688Platform(store.platform)) return false;
    ensureAlibabaAuth(store);
    if (store.alibabaAuthEdited && storeHasAlibabaAuth(store)) return false;
    return !storeHasAlibabaAuth(store);
  }

  function syncAlibabaAuthChrome() {
    var saveBtn = $('btnAlibabaAuthSave');
    var editBtn = $('btnAlibabaAuthEdit');
    if (saveBtn) saveBtn.hidden = !alibabaAuthEditing;
    if (editBtn) editBtn.hidden = alibabaAuthEditing;
    var showTip = currentStore ? shouldShowAlibabaAuthTip(currentStore) : false;
    var tip = $('alibabaAuthTip');
    if (tip) tip.hidden = !showTip;
    var card = $('alibabaAuthCard');
    if (card) {
      card.classList.toggle('is-highlight', showTip);
      card.classList.toggle('is-editing', alibabaAuthEditing);
    }
    document.querySelectorAll('.alibaba-auth-input').forEach(function(input) {
      input.classList.toggle('is-highlight', alibabaAuthEditing);
    });
  }

  function renderAlibabaAuthSummary(store) {
    ensureAlibabaAuth(store);
    var authInfo = tagForAuth(store.authStatus);
    var statusEl = $('alibabaAuthStatus');
    statusEl.textContent = authInfo.text;
    statusEl.className = 'tag ' + authInfo.tag;
    $('alibabaAuthTime').textContent = store.authTime || '—';
    $('alibabaAuthExpire').textContent = store.authExpire || '—';
    $('alibabaAuthRemain').textContent = remainDays(store.authExpire);
    $('alibabaAuthMainAccount').textContent = store.mainAccountId || '—';
    $('viewAlibabaAccessToken').textContent = store.accessToken || '—';
    $('inlineAlibabaAccessToken').value = store.accessToken || '';
    syncAlibabaAuthChrome();
  }

  function setAlibabaAuthViewMode() {
    alibabaAuthEditing = false;
    alibabaAuthHighlight = false;
    $('inlineAlibabaAccessToken').hidden = true;
    $('inlineAlibabaAccessToken').disabled = true;
    $('viewAlibabaAccessToken').hidden = false;
    if (currentStore) renderAlibabaAuthSummary(currentStore);
    else syncAlibabaAuthChrome();
  }

  function enterAlibabaAuthEdit(withHighlight) {
    if (!currentStore || !is1688Platform(currentStore.platform)) return;
    ensureAlibabaAuth(currentStore);
    alibabaAuthEditing = true;
    alibabaAuthHighlight = !!withHighlight && shouldShowAlibabaAuthTip(currentStore);
    $('inlineAlibabaAccessToken').hidden = false;
    $('inlineAlibabaAccessToken').disabled = false;
    $('viewAlibabaAccessToken').hidden = true;
    var token = clampTemuField(currentStore.accessToken || '', ALIBABA_ACCESS_TOKEN_MAX);
    $('inlineAlibabaAccessToken').setAttribute('maxlength', String(ALIBABA_ACCESS_TOKEN_MAX));
    $('inlineAlibabaAccessToken').value = token;
    syncAlibabaAuthChrome();
    $('inlineAlibabaAccessToken').focus();
  }

  function bindAlibabaAuthInputLimits() {
    var el = $('inlineAlibabaAccessToken');
    if (!el || el.dataset.lengthBound === '1') return;
    el.dataset.lengthBound = '1';
    el.setAttribute('maxlength', String(ALIBABA_ACCESS_TOKEN_MAX));
    function enforce() {
      var raw = el.value || '';
      if (raw.length <= ALIBABA_ACCESS_TOKEN_MAX) return;
      el.value = raw.slice(0, ALIBABA_ACCESS_TOKEN_MAX);
      toast('access Token 最长 ' + ALIBABA_ACCESS_TOKEN_MAX + ' 位', 'error');
    }
    el.addEventListener('input', enforce);
    el.addEventListener('paste', function() { setTimeout(enforce, 0); });
    el.addEventListener('change', enforce);
  }

  function saveAlibabaAuthInline() {
    if (!currentStore || !is1688Platform(currentStore.platform)) return;
    ensureAlibabaAuth(currentStore);
    var accessToken = clampTemuField(value('inlineAlibabaAccessToken'), ALIBABA_ACCESS_TOKEN_MAX).trim();
    if (!accessToken) {
      toast('access Token 为必填项', 'error');
      return;
    }
    if (accessToken.length > ALIBABA_ACCESS_TOKEN_MAX) {
      toast('access Token 最长 ' + ALIBABA_ACCESS_TOKEN_MAX + ' 位', 'error');
      return;
    }

    var oldToken = currentStore.accessToken || '';
    var oldAuthStatus = currentStore.authStatus || '未授权';
    var oldAuthTime = currentStore.authTime || '—';
    var oldAuthExpire = currentStore.authExpire || '—';
    currentStore.accessToken = accessToken;
    currentStore.alibabaAuthEdited = true;
    applyAlibabaAuthFromToken(currentStore);

    var changes = [];
    if (oldToken !== accessToken) changes.push('access Token：' + formatLogValue(oldToken) + ' → ' + formatLogValue(accessToken));
    if (oldAuthStatus !== currentStore.authStatus) changes.push('授权状态：' + formatLogValue(oldAuthStatus) + ' → ' + formatLogValue(currentStore.authStatus));
    if (oldAuthTime !== (currentStore.authTime || '—')) changes.push('授权时间：' + formatLogValue(oldAuthTime) + ' → ' + formatLogValue(currentStore.authTime));
    if (oldAuthExpire !== (currentStore.authExpire || '—')) changes.push('过期时间：' + formatLogValue(oldAuthExpire) + ' → ' + formatLogValue(currentStore.authExpire));
    if (changes.length) {
      pushOperationLog(currentStore, '授权', '编辑', changes.join('；'));
    } else {
      pushOperationLog(currentStore, '授权', '编辑', '授权信息保存，字段无变更');
    }

    renderTable();
    renderAlibabaAuthSummary(currentStore);
    setAlibabaAuthViewMode();
    renderOperationLogs(currentStore);
    toast('授权信息保存成功，已更新授权状态');
  }

  function renderOperationLogs(store) {
    ensureOperationLogs(store);
    var body = $('operationLogBody');
    if (!body) return;
    if (!store.operationLogs.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-cell">暂无操作日志</td></tr>';
      return;
    }
    body.innerHTML = store.operationLogs.map(function(log) {
      return '<tr>' +
        '<td>' + escapeHtml(log.time || '—') + '</td>' +
        '<td>' + escapeHtml(log.operator || '—') + '</td>' +
        '<td>' + escapeHtml(log.module || '—') + '</td>' +
        '<td>' + escapeHtml(log.type || '—') + '</td>' +
        '<td>' + escapeHtml(log.content || '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  function setTokenRegionTabs(containerId, region) {
    var container = $(containerId);
    if (!container) return;
    container.querySelectorAll('.token-region-tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.region === region);
    });
  }

  function renderAuthOrderTokenRegion(store, region) {
    ensureTemuTokens(store);
    var token = store.orderPullTokens[region] || emptyTokenTriplet();
    $('authOrderAccessToken').textContent = maskToken(token.accessToken);
    $('authOrderAppKey').textContent = maskToken(token.appKey);
    $('authOrderAppSecret').textContent = maskToken(token.appSecret);
  }

  function renderAuthProductToken(store) {
    ensureTemuTokens(store);
    var token = store.productPullToken || emptyTokenTriplet();
    $('authProductAccessToken').textContent = maskToken(token.accessToken);
    $('authProductAppKey').textContent = maskToken(token.appKey);
    $('authProductAppSecret').textContent = maskToken(token.appSecret);
  }

  function renderRelatedStores(store) {
    $('mainAccountCard').hidden = !store.mainAccountId;
    if (!store.mainAccountId) return;
    $('relatedStores').innerHTML = (store.relatedStores || []).map(function(name) {
      return '<div class="related-item"><span>' + name + '</span><span class="tag tag-green">已录入</span></div>';
    }).join('') || '<div class="related-item"><span>暂无其他已录入店铺</span></div>';
    $('unrecordedStoresTip').hidden = !store.unrecordedStores;
    $('unrecordedStoresCount').textContent = store.unrecordedStores || 0;
  }

  function remainDays(expireText) {
    if (!expireText || expireText === '—') return '—';
    var remain = Math.ceil((new Date(expireText) - new Date()) / (1000*60*60*24));
    return remain > 0 ? remain + ' 天' : '已过期';
  }

  function activateDetailTab(tabName) {
    document.querySelectorAll('.detail-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelector('.detail-tab[data-tab="' + tabName + '"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(function(t){ t.hidden = true; });
    $('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).hidden = false;
  }

  function bindDetail() {
    $('btnCloseDetail').addEventListener('click', function(){ $('drawerDetail').hidden = true; });
    document.querySelector('.detail-tabs').addEventListener('click', function(e) {
      var tab = e.target.closest('.detail-tab');
      if (tab) activateDetailTab(tab.dataset.tab);
    });
    $('btnDownloadPayment').addEventListener('click', function(){ downloadPaymentInfo([currentStore]); });
    $('btnUnlockSensitive').addEventListener('click', function() {
      if (!currentStore) return;
      var password = prompt('为保护店铺资金信息安全，请输入查阅密码后继续查看');
      if (password === null) return;
      sensitiveUnlocked = true;
      renderSensitive(currentStore);
      toast('资金信息已解锁');
    });
    $('btnLockSensitive').addEventListener('click', function() {
      sensitiveUnlocked = false;
      renderSensitive(currentStore);
      toast('资金信息已重新锁定');
    });
    $('btnEditBasic').addEventListener('click', function(){ if (currentStore) openEditBasic(currentStore, 'detail'); });
    $('btnEditBiz').addEventListener('click', function(){ if (currentStore) openEditBiz(currentStore, 'detail'); });
    $('btnTemuAuthEdit').addEventListener('click', function(){ enterTemuAuthEdit(false); });
    $('btnTemuAuthSave').addEventListener('click', saveTemuAuthInline);
    bindTemuAuthInputLimits();
    $('btnAlibabaAuthEdit').addEventListener('click', function(){ enterAlibabaAuthEdit(false); });
    $('btnAlibabaAuthSave').addEventListener('click', saveAlibabaAuthInline);
    bindAlibabaAuthInputLimits();
    $('btnOzonAuthEdit').addEventListener('click', function(){ enterOzonAuthEdit(false); });
    $('btnOzonAuthSave').addEventListener('click', saveOzonAuthInline);
    $('btnBatchDownloadPayment').addEventListener('click', downloadSelectedPaymentInfo);
    $('authOrderTokenTabs').addEventListener('click', function(e) {
      var tab = e.target.closest('.token-region-tab');
      if (!tab || !currentStore || !isTemuPlatform(currentStore.platform)) return;
      if (temuAuthEditing && editOrderTokenDraft) {
        editOrderTokenDraft[authOrderTokenRegion] = readOrderTokenInputs();
        authOrderTokenRegion = tab.dataset.region;
        fillOrderTokenInputs(editOrderTokenDraft[authOrderTokenRegion]);
        setTokenRegionTabs('authOrderTokenTabs', authOrderTokenRegion);
        return;
      }
      authOrderTokenRegion = tab.dataset.region;
      setTokenRegionTabs('authOrderTokenTabs', authOrderTokenRegion);
      renderAuthOrderTokenRegion(currentStore, authOrderTokenRegion);
    });
  }

  function openReAuth(store) {
    currentStore = store;
    if (shouldUseMainAccountAuth(store)) {
      var confirmed = confirm(
        '即将跳转到 Shopee 主账号授权地址。\n\n' +
        '店铺：' + (store.alias || store.name) + '\n' +
        '授权成功后，系统会返回主店铺与子店铺资产，并要求补充/确认店铺系统名称。\n\n' +
        '点击确定模拟主账号授权成功并进入店铺名称录入。'
      );
      if (!confirmed) return;
      openShopeeAuthResult(store.alias || store.name, store.storeType || '跨境店（CNSC）', store.storeType || 'cnsc', store);
      return;
    }
    $('modalReAuth').hidden = false;
    $('reAuthExpire').textContent = store.authExpire || '—';
  }

  function bindReAuth() {
    $('btnCloseReAuth').addEventListener('click', function(){ $('modalReAuth').hidden = true; });
    $('btnCancelReAuth').addEventListener('click', function(){ $('modalReAuth').hidden = true; });
    $('btnConfirmReAuth').addEventListener('click', function() {
      if (!currentStore) return;
      var confirmed = confirm('即将在新窗口打开 Shopee 店铺账号授权页面。\n\n店铺：' + currentStore.alias + '\n这是本土/单店铺授权，不会返回子店铺资产，也不需要录入子店铺名称；系统仅更新授权状态和到期时间。\n\n点击确定模拟授权成功。');
      if (!confirmed) return;
      currentStore.authStatus = '已授权';
      currentStore.authTime = formatNow();
      currentStore.authExpire = nextYear();
      currentStore.syncOrderTime = formatNow();
      $('modalReAuth').hidden = true;
      renderTable();
      if (!$('drawerDetail').hidden) openDetail(currentStore);
      toast('店铺授权成功！有效期已更新至 ' + currentStore.authExpire);
    });
  }

  function cancelAuth() {
    if (!currentStore) return;
    var confirmed = confirm('确认取消该店铺的 Shopee 授权吗？\n\n取消后将无法同步订单和产品数据。\n建议同时在 Shopee 卖家中心取消授权。');
    if (!confirmed) return;
    currentStore.authStatus = '未授权';
    currentStore.authTime = '—';
    currentStore.authExpire = '—';
    currentStore.syncOrderTime = '—';
    renderTable();
    openDetail(currentStore);
    activateDetailTab('auth');
    toast('授权已取消');
  }

  function openEditBasic(store, origin) {
    normalizeStore(store);
    currentStore = store;
    editOrigin = origin || ($('drawerDetail').hidden ? 'table' : 'detail');
    creatingBasicStore = editOrigin === 'create' || !!store._draft;
    $('drawerEditBasic').hidden = false;
    $('editPlatformReadonlyGroup').hidden = creatingBasicStore;
    $('editPlatformSelectGroup').hidden = !creatingBasicStore;
    $('editPlatform').textContent = store.platform || '—';
    $('editPlatformSelect').value = creatingBasicStore ? '' : (store.platform || '');
    var aliasValue = store.alias || '';
    if (isTemuPlatform(store.platform)) {
      aliasValue = store.temuBaseAlias || stripTemuAliasSuffix(aliasValue) || aliasValue;
    }
    $('editAlias').value = aliasValue;
    $('editStoreEmail').value = store.storeEmail || '';
    $('editAdAccountId').value = store.adAccountId || '';
    $('editBcId').value = store.bcId || '';
    $('editShopId').value = store.platformShopId || '';
    $('editShopName').value = store.platformShopName || '';
    $('editSite').textContent = supportsSiteField(store.platform) ? (store.site || '—') : '';
    $('editSiteSelect').value = creatingBasicStore ? '' : (supportsSiteField(store.platform) ? (store.site || '') : '');
    document.querySelectorAll('.platform-edit-tiktok').forEach(function(el){ el.hidden = store.platform !== 'TikTok Shop'; });
    document.querySelectorAll('.platform-edit-shopee').forEach(function(el){ el.hidden = store.platform !== 'Shopee'; });
    setBrowserEnumValue(store.browserName || '');
    $('editBrowserStore').value = store.browserStoreName || '';
    $('editAccountType').value = ['自注册', '购买'].indexOf(store.accountType) >= 0 ? store.accountType : '';
    $('editRegistrationType').value = ['企业', '个人'].indexOf(store.registrationType) >= 0 ? store.registrationType : '';
    syncSelect('editAccountType');
    syncSelect('editRegistrationType');
    populatePrincipalSelect('editRegistrationSubject', store.registrationCompany || '', creatingBasicStore);
    updateRegistrationMeta('editRegistrationSubject', 'editRegistrationCode', 'editEnterpriseRegistrationTime');
    syncSelect('editPlatformSelect');
    syncSelect('editSiteSelect');
    syncSelect('editRegistrationSubject');
    updateEditCreatePlatformFields();
    syncStoreTypeOptions(creatingBasicStore ? value('editPlatformSelect') : store.platform, store.storeType);
    syncIsMallField(creatingBasicStore ? value('editPlatformSelect') : store.platform, creatingBasicStore ? '' : store.isMall);
    syncSiteFieldVisibility(creatingBasicStore ? value('editPlatformSelect') : store.platform);
  }

  function bindEditBasic() {
    ['btnCloseEditBasic','btnCancelEditBasic'].forEach(function(id) {
      $(id).addEventListener('click', function(){ $('drawerEditBasic').hidden = true; });
    });
    $('editPlatformSelect').addEventListener('change', updateEditCreatePlatformFields);
    $('btnSaveEditBasic').addEventListener('click', function() {
      if (!currentStore) return;
      var platform = creatingBasicStore ? value('editPlatformSelect') : currentStore.platform;
      var site = '';
      if (supportsSiteField(platform)) {
        site = creatingBasicStore ? value('editSiteSelect') : (currentStore.site || '');
      }
      if (creatingBasicStore && !platform) {
        toast('请选择电商平台', 'error');
        return;
      }
      var aliasInput = value('editAlias');
      var aliasForValidate = isTemuPlatform(platform) ? stripTemuAliasSuffix(aliasInput) : aliasInput;
      if (aliasForValidate.length < 2) {
        toast('店铺别名长度需为 2-50 个字符', 'error');
        return;
      }
      if (creatingBasicStore && supportsSiteField(platform) && !site) {
        toast('请选择站点', 'error');
        return;
      }
      if (!hidesStoreType(platform) && !value('editStoreType')) {
        toast('请选择店铺类型', 'error');
        return;
      }
      if (platform === 'Shopee' && !value('editIsMall')) {
        toast('请选择是否mall店', 'error');
        return;
      }
      if (!value('editBrowserName')) {
        toast('请选择浏览器名称', 'error');
        return;
      }
      if (!value('editBrowserStore')) {
        toast('请填写浏览器店铺名称', 'error');
        return;
      }
      if (!value('editAccountType')) {
        toast('请选择账号注册类型', 'error');
        return;
      }
      if (!value('editRegistrationType')) {
        toast('请选择注册类型', 'error');
        return;
      }
      if (!value('editRegistrationSubject')) {
        toast('请选择注册主体', 'error');
        return;
      }
      if (creatingBasicStore && platformRequiresManualShopMeta(platform) && (!value('editShopId') || !value('editShopName'))) {
        toast('请补充该平台后台店铺ID与后台店铺名称', 'error');
        return;
      }
      currentStore.platform = platform;
      currentStore.site = site;
      var oldBody = currentStore.registrationCompany || currentStore.body || '';
      var newBody = value('editRegistrationSubject');
      if (!creatingBasicStore && oldBody !== newBody) {
        currentStore.bodyChangeRecords = currentStore.bodyChangeRecords || [];
        currentStore.bodyChangeRecords.unshift({ time: formatNow(), operator: 'Freddy', from: oldBody || '—', to: newBody || '—' });
        toast('注册主体已变更，请关注收款与授权主体一致性');
      }
      currentStore.body = newBody;
      currentStore.storeEmail = value('editStoreEmail');
      currentStore.adAccountId = value('editAdAccountId');
      currentStore.bcId = value('editBcId');
      currentStore.platformShopId = value('editShopId');
      currentStore.platformShopName = value('editShopName');
      currentStore.storeType = hidesStoreType(platform) ? '' : value('editStoreType');
      currentStore.isMall = platform === 'Shopee' ? (value('editIsMall') === '是') : false;
      currentStore.browserName = value('editBrowserName');
      currentStore.browserStoreName = value('editBrowserStore');
      currentStore.accountType = value('editAccountType');
      currentStore.registrationType = value('editRegistrationType');
      currentStore.registrationCompany = newBody;
      currentStore.registrationCode = principalCode(newBody);
      currentStore.registrationDate = principalEnterpriseRegistrationTime(newBody);
      var isNew = creatingBasicStore;
      if (isTemuPlatform(platform)) {
        var baseAlias = stripTemuAliasSuffix(aliasInput);
        var regionKey = resolveTemuRegionKey(isNew ? null : currentStore, aliasInput);
        if (!currentStore.temuGroupId) {
          currentStore.temuGroupId = 'TG-' + baseAlias + '-' + Date.now().toString(36).slice(-4);
        }
        applyTemuRegionToStore(currentStore, regionKey, baseAlias);
        currentStore.temuGroupId = currentStore.temuGroupId || ('TG-' + baseAlias);
      } else {
        currentStore.alias = aliasInput;
        if (isNew) currentStore.name = currentStore.alias;
      }
      if (isNew) {
        currentStore.status = '启用';
        currentStore.enabled = true;
        currentStore.authStatus = '未授权';
        currentStore.authTime = '—';
        currentStore.authExpire = '—';
        currentStore.syncOrderTime = '—';
        currentStore._draft = false;
        window.STORE_DATA = [currentStore].concat(window.STORE_DATA);
      }
      $('drawerEditBasic').hidden = true;
      renderTable();
      if (isNew) {
        openEditBiz(currentStore, 'create');
        toast('基础资料保存成功，请继续完善业务信息');
      } else {
        if (editOrigin === 'detail' || editOrigin === 'create') openDetail(currentStore);
        toast('基础资料保存成功');
      }
      creatingBasicStore = false;
    });
  }

  function openEditBiz(store, origin) {
    normalizeStore(store);
    currentStore = store;
    editOrigin = origin || ($('drawerDetail').hidden ? 'table' : 'detail');
    if (editOrigin === 'table') $('drawerDetail').hidden = true;
    $('drawerEditBiz').hidden = false;
    var isNew = (origin === 'create');
    var deptSelect = $('editDept');
    if (store.dept) {
      var found = false;
      for (var i = 0; i < deptSelect.options.length; i++) {
        if (deptSelect.options[i].value === store.dept || deptSelect.options[i].text === store.dept) {
          found = true; break;
        }
      }
      if (!found) {
        var opt = document.createElement('option');
        opt.value = store.dept;
        opt.text = store.dept;
        deptSelect.add(opt);
      }
    }
    deptSelect.value = store.dept || '';
    syncSelect('editDept');
    $('editOwner').value = store.owner || '';
    $('editUseStatus').value = store.useStatus || (isNew ? '启用' : '');
    renderPaymentEditList(store.paymentAccounts || []);
    $('editHasDeposit').value = store.hasDeposit ? '是' : '否';
    $('editDepositRefundStatus').value = store.depositRefundStatus || '无需退回';
    syncSelect('editHasDeposit');
    syncSelect('editDepositRefundStatus');
    $('editDepositAccount').value = store.depositAccountRaw || '';
    $('editDepositAmount').value = store.depositAmount || '';
    $('editDepositRefundTime').value = store.depositRefundTime || '';
    $('editDepositRefundTransactionId').value = store.depositRefundTransactionId || '';
    $('editRemarks').value = isNew ? '' : (store.remarks || '');
  }

  function bindEditBiz() {
    ['btnCloseEditBiz','btnCancelEditBiz'].forEach(function(id) {
      $(id).addEventListener('click', function(){ $('drawerEditBiz').hidden = true; });
    });
    $('btnAddPaymentAccount').addEventListener('click', function() {
      addPaymentEditRow({ platform: '', accountRaw: '', accountId: '', currency: 'USD' });
    });
    $('btnSaveEditBiz').addEventListener('click', function() {
      if (!currentStore) return;
      if (!value('editDept')) {
        toast('请填写账号需求部门', 'error');
        return;
      }
      if (!value('editOwner')) {
        toast('请填写账号需求负责人', 'error');
        return;
      }
      var accounts = collectPaymentEditRows();
      var invalidAccount = accounts.some(function(account) {
        return (account.platform && !account.accountRaw) || (!account.platform && account.accountRaw);
      });
      if (invalidAccount) {
        toast('收款平台与收款账号需要成对填写', 'error');
        return;
      }
      var hasDeposit = $('editHasDeposit').value === '是';
      if (hasDeposit && !value('editDepositAccount')) {
        toast('请填写保证金缴纳的账号', 'error');
        return;
      }
      if (hasDeposit && (!value('editDepositAmount') || Number(value('editDepositAmount').replace(/,/g, '')) <= 0)) {
        toast('请填写正确的保证金金额', 'error');
        return;
      }
      if ($('editDepositRefundStatus').value === '已退回' && !value('editDepositRefundTime') && !value('editDepositRefundTransactionId')) {
        toast('请至少填写保证金退回时间或退回流水号', 'error');
        return;
      }
      currentStore.dept = value('editDept');
      currentStore.owner = value('editOwner');
      currentStore.useStatus = value('editUseStatus');
      var oldPayment = JSON.stringify(currentStore.paymentAccounts || []);
      currentStore.paymentAccounts = accounts.map(function(account) {
        return {
          platform: account.platform,
          accountRaw: account.accountRaw,
          account: maskAccount(account.accountRaw),
          accountId: account.accountId,
          currency: account.currency || 'USD'
        };
      });
      if (oldPayment !== JSON.stringify(currentStore.paymentAccounts)) {
        currentStore.paymentChangeRecords = currentStore.paymentChangeRecords || [];
        currentStore.paymentChangeRecords.unshift({ time: formatNow(), operator: 'Freddy', content: '更新收款账号，共 ' + currentStore.paymentAccounts.length + ' 个' });
        toast('收款信息已变更，请确认主体与各收款账号平台一致性');
      }
      var first = currentStore.paymentAccounts[0] || {};
      currentStore.fundPlatform = first.platform || '';
      currentStore.fundAccountRaw = first.accountRaw || '';
      currentStore.fundAccount = first.account || '';
      currentStore.fundAccountId = first.accountId || '';
      currentStore.hasDeposit = hasDeposit;
      currentStore.depositRefundStatus = hasDeposit ? $('editDepositRefundStatus').value : '无需退回';
      currentStore.depositAccountRaw = hasDeposit ? value('editDepositAccount') : '';
      currentStore.depositAccount = hasDeposit && value('editDepositAccount') ? '**** ' + value('editDepositAccount').slice(-4) : '';
      currentStore.depositAmount = hasDeposit ? value('editDepositAmount') : '';
      currentStore.depositRefundTime = hasDeposit ? value('editDepositRefundTime') : '';
      currentStore.depositRefundTransactionId = hasDeposit ? value('editDepositRefundTransactionId') : '';
      currentStore.remarks = value('editRemarks');
      $('drawerEditBiz').hidden = true;
      renderTable();
      var savedOrigin = editOrigin;
      var needTemuAuth = savedOrigin === 'create' && isTemuPlatform(currentStore.platform);
      var needOzonAuth = savedOrigin === 'create' && isOzonPlatform(currentStore.platform);
      var needAlibabaAuth = savedOrigin === 'create' && is1688Platform(currentStore.platform);
      if (needTemuAuth) currentStore._pendingTemuAuthHighlight = true;
      if (needOzonAuth) currentStore._pendingOzonAuthHighlight = true;
      if (needAlibabaAuth) currentStore._pendingAlibabaAuthHighlight = true;
      var needAuth = needTemuAuth || needOzonAuth || needAlibabaAuth;
      if (savedOrigin === 'detail' || needAuth || savedOrigin === 'create') {
        openDetail(currentStore);
        activateDetailTab(needAuth ? 'auth' : 'biz');
      }
      toast('业务信息保存成功');
      if (needTemuAuth) {
        toast('请在授权处完善订单/商品拉取 Token', 'success');
      } else if (needOzonAuth) {
        toast('请在授权处完善 Client ID、API Key', 'success');
      } else if (needAlibabaAuth) {
        toast('请在授权处完善 access Token', 'success');
      }
    });
  }

  function shouldShowTemuAuthTip(store) {
    if (!store || !isTemuPlatform(store.platform)) return false;
    ensureTemuTokens(store);
    if (store.temuAuthEdited) return false;
    return !storeHasTemuTokens(store);
  }

  function syncTemuAuthChrome() {
    var saveBtn = $('btnTemuAuthSave');
    var editBtn = $('btnTemuAuthEdit');
    if (saveBtn) saveBtn.hidden = !temuAuthEditing;
    if (editBtn) editBtn.hidden = temuAuthEditing;
    var showTip = currentStore ? shouldShowTemuAuthTip(currentStore) : false;
    var tip = $('temuAuthTip');
    if (tip) tip.hidden = !showTip;
    var card = $('temuAuthCard');
    if (card) {
      card.classList.toggle('is-highlight', showTip);
      card.classList.toggle('is-editing', temuAuthEditing);
    }
    document.querySelectorAll('.temu-auth-input').forEach(function(input) {
      input.classList.toggle('is-highlight', temuAuthEditing);
    });
    var orderView = $('authOrderTokenPanelView');
    var orderEdit = $('authOrderTokenPanelEdit');
    var productView = $('authProductTokenPanelView');
    var productEdit = $('authProductTokenPanelEdit');
    if (orderView) orderView.hidden = temuAuthEditing;
    if (orderEdit) orderEdit.hidden = !temuAuthEditing;
    if (productView) productView.hidden = temuAuthEditing;
    if (productEdit) productEdit.hidden = !temuAuthEditing;
  }

  function renderTemuAuthSummary(store) {
    ensureTemuTokens(store);
    var authInfo = tagForAuth(store.authStatus);
    var statusEl = $('temuAuthStatus');
    statusEl.textContent = authInfo.text;
    statusEl.className = 'tag ' + authInfo.tag;
    $('temuAuthTime').textContent = store.authTime || '—';
    $('temuAuthExpire').textContent = store.authExpire || '—';
    $('temuAuthRemain').textContent = remainDays(store.authExpire);
    $('temuAuthMainAccount').textContent = store.mainAccountId || '—';
    renderAuthOrderTokenRegion(store, authOrderTokenRegion);
    renderAuthProductToken(store);
    setTokenRegionTabs('authOrderTokenTabs', authOrderTokenRegion);
    syncTemuAuthChrome();
  }

  function setTemuAuthViewMode() {
    temuAuthEditing = false;
    temuAuthHighlight = false;
    editOrderTokenDraft = null;
    if (currentStore) renderTemuAuthSummary(currentStore);
    else syncTemuAuthChrome();
  }

  function enterTemuAuthEdit(withHighlight) {
    if (!currentStore || !isTemuPlatform(currentStore.platform)) return;
    ensureTemuTokens(currentStore);
    temuAuthEditing = true;
    temuAuthHighlight = !!withHighlight && shouldShowTemuAuthTip(currentStore);
    authOrderTokenRegion = 'us';
    editOrderTokenDraft = {
      us: clampTemuTokenTriplet(currentStore.orderPullTokens.us),
      eu: clampTemuTokenTriplet(currentStore.orderPullTokens.eu),
      global: clampTemuTokenTriplet(currentStore.orderPullTokens.global)
    };
    fillOrderTokenInputs(editOrderTokenDraft.us);
    var product = clampTemuTokenTriplet(currentStore.productPullToken);
    applyTemuInputMaxAttributes();
    $('editProductAccessToken').value = product.accessToken || '';
    $('editProductAppKey').value = product.appKey || '';
    $('editProductAppSecret').value = product.appSecret || '';
    setTokenRegionTabs('authOrderTokenTabs', authOrderTokenRegion);
    syncTemuAuthChrome();
    $('editOrderAccessToken').focus();
  }

  function tokenTripletLog(label, oldToken, newToken) {
    var changes = [];
    if ((oldToken.accessToken || '') !== (newToken.accessToken || '')) {
      changes.push(label + ' access_token：' + formatLogValue(oldToken.accessToken) + ' → ' + formatLogValue(newToken.accessToken));
    }
    if ((oldToken.appKey || '') !== (newToken.appKey || '')) {
      changes.push(label + ' App Key：' + formatLogValue(oldToken.appKey) + ' → ' + formatLogValue(newToken.appKey));
    }
    if ((oldToken.appSecret || '') !== (newToken.appSecret || '')) {
      changes.push(label + ' App Secret：' + formatLogValue(oldToken.appSecret) + ' → ' + formatLogValue(newToken.appSecret));
    }
    return changes;
  }

  function saveTemuAuthInline() {
    if (!currentStore || !isTemuPlatform(currentStore.platform)) return;
    ensureTemuTokens(currentStore);
    if (!editOrderTokenDraft) {
      editOrderTokenDraft = {
        us: Object.assign({}, currentStore.orderPullTokens.us),
        eu: Object.assign({}, currentStore.orderPullTokens.eu),
        global: Object.assign({}, currentStore.orderPullTokens.global)
      };
    }
    editOrderTokenDraft[authOrderTokenRegion] = readOrderTokenInputs();
    var nextOrder = {
      us: Object.assign({}, editOrderTokenDraft.us),
      eu: Object.assign({}, editOrderTokenDraft.eu),
      global: Object.assign({}, editOrderTokenDraft.global)
    };
    var nextProduct = clampTemuTokenTriplet({
      accessToken: value('editProductAccessToken'),
      appKey: value('editProductAppKey'),
      appSecret: value('editProductAppSecret')
    });
    nextOrder = {
      us: clampTemuTokenTriplet(nextOrder.us),
      eu: clampTemuTokenTriplet(nextOrder.eu),
      global: clampTemuTokenTriplet(nextOrder.global)
    };

    var lengthError = validateTemuTokenTripletLengths(nextOrder.us, '美区订单') ||
      validateTemuTokenTripletLengths(nextOrder.eu, '欧区订单') ||
      validateTemuTokenTripletLengths(nextOrder.global, '全球订单') ||
      validateTemuTokenTripletLengths(nextProduct, '商品');
    if (lengthError) {
      toast(lengthError, 'error');
      return;
    }

    var oldOrder = {
      us: Object.assign({}, currentStore.orderPullTokens.us),
      eu: Object.assign({}, currentStore.orderPullTokens.eu),
      global: Object.assign({}, currentStore.orderPullTokens.global)
    };
    var oldProduct = Object.assign({}, currentStore.productPullToken);
    var oldAuthStatus = currentStore.authStatus || '未授权';
    var oldAuthTime = currentStore.authTime || '—';
    var oldAuthExpire = currentStore.authExpire || '—';

    currentStore.orderPullTokens = nextOrder;
    currentStore.productPullToken = nextProduct;
    currentStore.temuAuthEdited = true;
    // 区域由基础资料维护（单店单区域），授权保存不改写 region
    if (!currentStore.region && currentStore.temuRegionKey) {
      var def = temuRegionByKey(currentStore.temuRegionKey);
      if (def) currentStore.region = def.label;
    }
    applyTemuAuthFromTokens(currentStore);

    var changes = [];
    ['us', 'eu', 'global'].forEach(function(region) {
      var regionLabel = region === 'us' ? '美区订单' : (region === 'eu' ? '欧区订单' : '全球订单');
      changes = changes.concat(tokenTripletLog(regionLabel, oldOrder[region], nextOrder[region]));
    });
    changes = changes.concat(tokenTripletLog('商品', oldProduct, nextProduct));
    if (oldAuthStatus !== currentStore.authStatus) changes.push('授权状态：' + formatLogValue(oldAuthStatus) + ' → ' + formatLogValue(currentStore.authStatus));
    if (oldAuthTime !== (currentStore.authTime || '—')) changes.push('授权时间：' + formatLogValue(oldAuthTime) + ' → ' + formatLogValue(currentStore.authTime));
    if (oldAuthExpire !== (currentStore.authExpire || '—')) changes.push('过期时间：' + formatLogValue(oldAuthExpire) + ' → ' + formatLogValue(currentStore.authExpire));
    if (changes.length) {
      pushOperationLog(currentStore, '授权', '编辑', changes.join('；'));
    } else {
      pushOperationLog(currentStore, '授权', '编辑', '授权信息保存，字段无变更');
    }

    renderTable();
    renderTemuAuthSummary(currentStore);
    setTemuAuthViewMode();
    renderOperationLogs(currentStore);
    toast(storeHasTemuTokens(currentStore) ? '授权信息保存成功，已更新授权状态' : '授权信息已保存（未填写 Token，保持未授权）');
  }

  function clampTemuField(value, max) {
    value = value == null ? '' : String(value);
    return value.length > max ? value.slice(0, max) : value;
  }

  function clampTemuTokenTriplet(token) {
    token = token || emptyTokenTriplet();
    return {
      accessToken: clampTemuField(token.accessToken, TEMU_ACCESS_TOKEN_MAX),
      appKey: clampTemuField(token.appKey, TEMU_APP_KEY_MAX),
      appSecret: clampTemuField(token.appSecret, TEMU_APP_SECRET_MAX)
    };
  }

  function applyTemuInputMaxAttributes() {
    Object.keys(TEMU_TOKEN_INPUT_IDS).forEach(function(id) {
      var el = $(id);
      if (!el) return;
      el.setAttribute('maxlength', String(TEMU_TOKEN_INPUT_IDS[id]));
    });
  }

  function bindTemuAuthInputLimits() {
    applyTemuInputMaxAttributes();
    Object.keys(TEMU_TOKEN_INPUT_IDS).forEach(function(id) {
      var el = $(id);
      if (!el || el.dataset.lengthBound === '1') return;
      el.dataset.lengthBound = '1';
      var max = TEMU_TOKEN_INPUT_IDS[id];
      var label = id.indexOf('AccessToken') >= 0 ? 'access_token' : (id.indexOf('AppKey') >= 0 ? 'App Key' : 'App Secret');
      function enforce() {
        var raw = el.value || '';
        if (raw.length <= max) return;
        el.value = raw.slice(0, max);
        toast(label + ' 最长 ' + max + ' 位', 'error');
      }
      el.addEventListener('input', enforce);
      el.addEventListener('paste', function() {
        setTimeout(enforce, 0);
      });
      el.addEventListener('change', enforce);
    });
  }

  function validateTemuTokenTripletLengths(token, label) {
    token = token || emptyTokenTriplet();
    if ((token.accessToken || '').length > TEMU_ACCESS_TOKEN_MAX) {
      return label + ' access_token 最长 ' + TEMU_ACCESS_TOKEN_MAX + ' 位';
    }
    if ((token.appKey || '').length > TEMU_APP_KEY_MAX) {
      return label + ' App Key 最长 ' + TEMU_APP_KEY_MAX + ' 位';
    }
    if ((token.appSecret || '').length > TEMU_APP_SECRET_MAX) {
      return label + ' App Secret 最长 ' + TEMU_APP_SECRET_MAX + ' 位';
    }
    return '';
  }

  function readOrderTokenInputs() {
    return clampTemuTokenTriplet({
      accessToken: value('editOrderAccessToken'),
      appKey: value('editOrderAppKey'),
      appSecret: value('editOrderAppSecret')
    });
  }

  function fillOrderTokenInputs(token) {
    token = clampTemuTokenTriplet(token || emptyTokenTriplet());
    applyTemuInputMaxAttributes();
    $('editOrderAccessToken').value = token.accessToken || '';
    $('editOrderAppKey').value = token.appKey || '';
    $('editOrderAppSecret').value = token.appSecret || '';
  }

  function renderPaymentEditList(accounts) {
    $('paymentEditList').innerHTML = '';
    (accounts.length ? accounts : [{ platform: '', accountRaw: '', accountId: '', currency: 'USD' }]).forEach(addPaymentEditRow);
  }

  function addPaymentEditRow(account) {
    var row = document.createElement('div');
    row.className = 'payment-edit-row';
    row.innerHTML =
      '<div class="enum-select payment-platform-select">' +
        '<input class="payment-platform" type="hidden" value="' + escapeHtml(account.platform || '') + '" />' +
        '<button class="enum-trigger payment-platform-trigger" type="button">请选择收款平台</button>' +
        '<div class="enum-dropdown payment-platform-dropdown" hidden>' +
          '<div class="payment-platform-options"></div>' +
          '<button class="enum-add payment-platform-add" type="button">+ 添加收款平台</button>' +
        '</div>' +
      '</div>' +
      '<input class="form-input payment-account" placeholder="收款账号" value="' + escapeHtml(account.accountRaw || '') + '" />' +
      '<input class="form-input payment-account-id" placeholder="账号ID" value="' + escapeHtml(account.accountId || '') + '" />' +
      '<button class="btn btn-icon payment-row-delete" type="button">×</button>';
    row.querySelector('.payment-row-delete').addEventListener('click', function() {
      row.remove();
      if (!$('paymentEditList').children.length) addPaymentEditRow({ platform: '', accountRaw: '', accountId: '', currency: 'USD' });
    });
    $('paymentEditList').appendChild(row);
    bindPaymentPlatformEnum(row);
  }

  function collectPaymentEditRows() {
    return Array.from(document.querySelectorAll('.payment-edit-row')).map(function(row) {
      return {
        platform: row.querySelector('.payment-platform').value.trim(),
        accountRaw: row.querySelector('.payment-account').value.trim(),
        accountId: row.querySelector('.payment-account-id').value.trim(),
        currency: 'USD'
      };
    }).filter(function(account) {
      return account.platform || account.accountRaw || account.accountId;
    });
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function(ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function requestPaymentPassword() {
    var password = prompt('下载收款信息包含敏感资金数据，请输入资金信息查看密码');
    if (password === null) return false;
    if (!password.trim()) {
      toast('请输入资金信息查看密码', 'error');
      return false;
    }
    return true;
  }

  function downloadSelectedPaymentInfo() {
    var stores = Array.from(selectedIds).map(function(id) {
      return window.STORE_DATA.find(function(s){ return s.id === id; });
    }).filter(Boolean);
    if (!stores.length) {
      toast('请先选择需要下载收款信息的店铺', 'error');
      return;
    }
    downloadPaymentInfo(stores);
  }

  function downloadPaymentInfo(stores) {
    stores = (stores || [currentStore]).filter(Boolean);
    if (!stores.length) return;
    if (!requestPaymentPassword()) return;
    stores.forEach(normalizeStore);
    var rows = [['店铺别名', '店铺主体', '收款平台', '收款账号', '账号ID', '币种']];
    stores.forEach(function(store) {
      if (!store.paymentAccounts.length) {
        rows.push([store.alias, store.body, '—', '—', '—', '—']);
        return;
      }
      store.paymentAccounts.forEach(function(account) {
        rows.push([store.alias, store.body, account.platform, account.accountRaw || account.account, account.accountId, account.currency || 'USD']);
      });
    });
    var csv = rows.map(function(row) {
      return row.map(function(cell) { return '"' + String(cell || '').replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = (stores.length === 1 ? (stores[0].alias || '店铺') : '批量店铺') + '-收款信息.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast('收款信息已下载，共 ' + stores.length + ' 个店铺');
  }

  function openAdSyncModal() {
    if (!currentStore) return;
    var setting = currentStore.adSyncSetting || {};
    $('modalAdSync').hidden = false;
    $('adSyncStart').value = setting.start || '2026-05-01';
    $('adSyncEnd').value = setting.end || '2026-05-19';
    $('adSyncFrequency').value = setting.frequency || '每日 02:00';
    syncSelect('adSyncFrequency');
  }

  function bindAdSync() {
    ['btnCloseAdSync','btnCancelAdSync'].forEach(function(id) {
      $(id).addEventListener('click', function(){ $('modalAdSync').hidden = true; });
    });
    $('btnSaveAdSync').addEventListener('click', function() {
      if (!currentStore) return;
      if (!value('adSyncStart') || !value('adSyncEnd')) {
        toast('请填写广告数据更新开始日期和结束日期', 'error');
        return;
      }
      currentStore.adSyncSetting = {
        start: value('adSyncStart'),
        end: value('adSyncEnd'),
        frequency: $('adSyncFrequency').value
      };
      $('modalAdSync').hidden = true;
      toast('广告数据更新时段已设置');
    });
  }

  function bindDrawerBlankClose() {
    document.querySelectorAll('.drawer-overlay').forEach(function(overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target !== overlay) return;
        overlay.hidden = true;
      });
    });
  }

  function init() {
    populatePrincipalSelect('inputRegistrationSubject', '', true);
    populatePrincipalSelect('editRegistrationSubject', principalList()[0] ? principalList()[0].name : '');
    updateRegistrationMeta('inputRegistrationSubject', 'inputRegistrationCode', 'inputEnterpriseRegistrationTime');
    updateRegistrationMeta('editRegistrationSubject', 'editRegistrationCode', 'editEnterpriseRegistrationTime');
    enhanceSelects();
    renderTable();
    bindTabs();
    bindFilters();
    bindSelection();
    bindRowActions();
    bindBrowserEnumSelect();
    bindCreateStore();
    bindRowAuth();
    bindDetail();
    bindReAuth();
    bindEditBasic();
    bindEditBiz();
    bindAdSync();
    bindPostAuthPermission();
    bindDrawerBlankClose();
    bindPrincipalSelector('inputRegistrationSubject', 'inputRegistrationCode', 'inputEnterpriseRegistrationTime');
    bindPrincipalSelector('editRegistrationSubject', 'editRegistrationCode', 'editEnterpriseRegistrationTime');
  }

  init();
})();
