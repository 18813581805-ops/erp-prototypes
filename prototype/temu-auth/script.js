(function () {
  var sites = window.TEMU_SITES || [];
  var stores = (window.TEMU_SITE_STORES || []).map(clone);
  var currentStep = 1;
  var draft = emptyDraft();
  var editingStoreId = null;

  function $(id) { return document.getElementById(id); }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function emptyDraft() {
    var siteState = {};
    sites.forEach(function (s) {
      siteState[s.key] = {
        enabled: false,
        orderToken: '',
        orderStatus: '未开通',
        warehouse: s.defaultWarehouse
      };
    });
    return {
      prefix: '',
      mode: '',
      company: '云易盒科技有限公司',
      productToken: '',
      productStatus: '未校验',
      merchantId: '',
      officialName: '',
      sites: siteState
    };
  }

  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (type ? ' ' + type : '');
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2400);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function maskToken(token) {
    if (!token) return '—';
    if (token.length <= 12) return token.slice(0, 4) + '****';
    return token.slice(0, 12) + '****';
  }

  function statusClass(status) {
    if (status === '正常拉取' || status === '校验通过' || status === '已开通' || status === '连通正常') return 'ok';
    if (status === 'Token 异常' || status === '未校验') return 'warn';
    if (status === '校验失败') return 'err';
    return 'off';
  }

  function siteMeta(key) {
    return sites.find(function (s) { return s.key === key; }) || { short: key, name: key, defaultWarehouse: '—' };
  }

  function buildStoreName(prefix, siteKey) {
    return prefix + '-' + siteMeta(siteKey).short + '店';
  }

  function formatNow() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function filteredStores() {
    var keyword = ($('filterKeyword').value || '').trim().toLowerCase();
    var site = $('filterSite').value;
    var orderStatus = $('filterOrderStatus').value;
    return stores.filter(function (s) {
      if (site && s.siteKey !== site) return false;
      if (orderStatus && s.orderStatus !== orderStatus) return false;
      if (!keyword) return true;
      var text = [s.name, s.parentPrefix, s.shopId, s.officialName, s.warehouse].join(' ').toLowerCase();
      return text.indexOf(keyword) >= 0;
    });
  }

  function renderTable() {
    var list = filteredStores();
    $('totalCount').textContent = String(list.length);
    var tbody = $('storeTableBody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty">暂无独立站点店铺</div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (s) {
      var meta = siteMeta(s.siteKey);
      return '<tr>' +
        '<td>' +
          '<div class="store-title">' + escapeHtml(s.name) + '</div>' +
          '<div class="store-sub">' + escapeHtml(s.mode) + ' · ' + escapeHtml(s.company) + '</div>' +
          '<span class="group-chip">父组 ' + escapeHtml(s.parentGroupId) + '</span>' +
        '</td>' +
        '<td>' + escapeHtml(s.parentPrefix) + '</td>' +
        '<td><span class="site-pill ' + s.siteKey + '">' + escapeHtml(meta.short) + '</span></td>' +
        '<td>' +
          '<div>' + escapeHtml(s.shopId) + '</div>' +
          '<div class="store-sub">' + escapeHtml(s.officialName || '—') + '</div>' +
        '</td>' +
        '<td>' +
          '<div style="margin-bottom:6px"><span class="status-tag ' + statusClass(s.productStatus) + '"><span class="dot"></span>' + escapeHtml(s.productStatus) + '</span></div>' +
          '<code class="token-mask">' + maskToken(s.productToken) + '</code>' +
          '<div class="store-sub" style="margin-top:4px">全站点共享</div>' +
        '</td>' +
        '<td>' +
          '<code class="token-mask">' + maskToken(s.orderToken) + '</code>' +
        '</td>' +
        '<td>' + escapeHtml(s.warehouse) + '</td>' +
        '<td><span class="status-tag ' + statusClass(s.orderStatus) + '"><span class="dot"></span>' + escapeHtml(s.orderStatus) + '</span></td>' +
        '<td><span class="status-tag ' + statusClass(s.financeBoard) + '">' + escapeHtml(s.financeBoard) + '</span></td>' +
        '<td><div class="cell-actions">' +
          '<button class="btn link" type="button" data-act="update-token" data-id="' + s.id + '">更新订单 Token</button>' +
          '<button class="btn link" type="button" data-act="bind-warehouse" data-id="' + s.id + '">绑定仓库</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function setStep(step) {
    currentStep = step;
    $('step1').hidden = step !== 1;
    $('step2').hidden = step !== 2;
    $('btnPrevStep').hidden = step === 1;
    $('btnNextStep').hidden = step !== 1;
    $('btnSaveBatch').hidden = step !== 2;
    document.querySelectorAll('.step-item').forEach(function (el) {
      var n = Number(el.dataset.step);
      el.classList.toggle('active', n === step);
      el.classList.toggle('done', n < step);
    });
    if (step === 2) {
      renderSiteCards();
      updatePreview();
    }
  }

  function openBatchModal() {
    draft = emptyDraft();
    editingStoreId = null;
    $('inputPrefix').value = '';
    $('inputMode').value = '';
    $('inputCompany').value = '云易盒科技有限公司';
    $('inputProductToken').value = '';
    syncProductMeta();
    setStep(1);
    $('authModal').hidden = false;
  }

  function closeBatchModal() {
    $('authModal').hidden = true;
  }

  function syncProductMeta() {
    var ok = draft.productStatus === '校验通过' && draft.merchantId;
    $('productFetchMeta').hidden = !ok;
    $('fetchedMerchantId').textContent = draft.merchantId || '—';
    $('fetchedShopName').textContent = draft.officialName || '—';
    var el = $('productVerifyStatus');
    el.textContent = draft.productStatus === '校验通过' ? '✓ 校验通过' : draft.productStatus;
    el.className = 'status-tag ' + statusClass(draft.productStatus);
  }

  function readStep1() {
    draft.prefix = ($('inputPrefix').value || '').trim();
    draft.mode = $('inputMode').value;
    draft.company = $('inputCompany').value;
    draft.productToken = ($('inputProductToken').value || '').trim();
  }

  function validateStep1() {
    readStep1();
    if (!draft.prefix || draft.prefix.length < 2) {
      toast('请填写主店铺 / 品牌前缀', 'error');
      return false;
    }
    if (!draft.mode) {
      toast('请选择托管业务类型', 'error');
      return false;
    }
    if (!draft.productToken) {
      toast('请填写全局商品 Token', 'error');
      return false;
    }
    if (draft.productStatus !== '校验通过' || !draft.merchantId) {
      toast('请先校验商品 Token', 'error');
      return false;
    }
    return true;
  }

  function renderSiteCards() {
    $('siteCards').innerHTML = sites.map(function (s) {
      var info = draft.sites[s.key];
      var enabled = !!info.enabled;
      var genName = draft.prefix ? buildStoreName(draft.prefix, s.key) : ('前缀-' + s.short + '店');
      var statusText = !enabled ? '未勾选' : (info.orderStatus === '连通正常' ? '✓ 连通正常' : (info.orderStatus === '校验失败' ? '✕ 校验失败' : '待测试'));
      var statusCls = !enabled ? 'off' : statusClass(info.orderStatus === '连通正常' ? '正常拉取' : (info.orderStatus === '校验失败' ? '校验失败' : '未校验'));
      return '<div class="site-card' + (enabled ? ' enabled' : '') + '">' +
        '<div class="site-card-head">' +
          '<label class="site-check">' +
            '<input type="checkbox" data-site-check="' + s.key + '"' + (enabled ? ' checked' : '') + ' />' +
            '<span>' +
              '<div class="site-title">' + s.name + '</div>' +
              '<div class="site-host">' + s.host + '</div>' +
              '<div class="site-gen-name">将生成独立店铺：' + escapeHtml(genName) + '</div>' +
            '</span>' +
          '</label>' +
          '<span class="status-tag ' + statusCls + '">' + statusText + '</span>' +
        '</div>' +
        '<div class="site-body">' +
          '<div class="site-body-row">' +
            '<input class="form-input" data-site-token="' + s.key + '" placeholder="粘贴该站点订单 Token" maxlength="128" ' +
              (enabled ? '' : 'disabled ') + 'value="' + escapeHtml(info.orderToken || '') + '" />' +
            '<button class="btn" type="button" data-site-test="' + s.key + '"' + (enabled ? '' : ' disabled') + '>测试连接</button>' +
          '</div>' +
          '<div class="site-body-row">' +
            '<span class="form-help" style="min-width:70px">关联仓库</span>' +
            '<select class="form-input wh-select" data-site-warehouse="' + s.key + '"' + (enabled ? '' : ' disabled') + '>' +
              warehouseOptions(info.warehouse) +
            '</select>' +
            '<span class="form-help">订单进入该站点店铺后，从此仓库扣库存</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function warehouseOptions(selected) {
    var options = ['美西仓', '美东仓', '德国仓', '英国仓', '华南中转仓', '深圳仓'];
    return options.map(function (w) {
      return '<option value="' + w + '"' + (w === selected ? ' selected' : '') + '>' + w + '</option>';
    }).join('');
  }

  function updatePreview() {
    var names = [];
    sites.forEach(function (s) {
      if (draft.sites[s.key].enabled) names.push(buildStoreName(draft.prefix || '前缀', s.key));
    });
    var box = $('previewBox');
    if (!names.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = '保存后将批量创建 <strong>' + names.length + '</strong> 个独立站点店铺：' + names.map(escapeHtml).join('、') +
      '。商品 Token 自动共享，订单/仓库/财务按站点隔离。';
  }

  function validateStep2() {
    var count = 0;
    for (var i = 0; i < sites.length; i++) {
      var key = sites[i].key;
      var info = draft.sites[key];
      if (!info.enabled) continue;
      count += 1;
      if (!info.orderToken) {
        toast('请填写「' + sites[i].short + '」订单 Token', 'error');
        return false;
      }
      if (info.orderStatus !== '连通正常') {
        toast('请先测试「' + sites[i].short + '」连接', 'error');
        return false;
      }
    }
    if (!count) {
      toast('请至少勾选一个要生成的站点', 'error');
      return false;
    }
    return true;
  }

  function verifyProductToken() {
    readStep1();
    if (!draft.productToken) {
      toast('请先粘贴商品 Token', 'error');
      return;
    }
    var btn = $('btnVerifyProduct');
    btn.disabled = true;
    btn.textContent = '校验中…';
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = '校验 Token';
      if (draft.productToken.length < 8) {
        draft.productStatus = '校验失败';
        draft.merchantId = '';
        draft.officialName = '';
        syncProductMeta();
        toast('商品 Token 校验失败', 'error');
        return;
      }
      draft.productStatus = '校验通过';
      draft.merchantId = 'MCH-' + String(100000 + Math.floor(Math.random() * 899999));
      draft.officialName = (draft.prefix || 'Temu') + ' Official';
      syncProductMeta();
      toast('校验通过：商品 Token 将自动下发给所选站点店铺', 'success');
    }, 700);
  }

  function testSite(key) {
    var info = draft.sites[key];
    if (!info || !info.enabled) return;
    var input = document.querySelector('[data-site-token="' + key + '"]');
    info.orderToken = input ? input.value.trim() : info.orderToken;
    if (!info.orderToken) {
      toast('请先粘贴该站点订单 Token', 'error');
      return;
    }
    var btn = document.querySelector('[data-site-test="' + key + '"]');
    if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
    setTimeout(function () {
      if (btn) { btn.disabled = false; btn.textContent = '测试连接'; }
      if (/fail|invalid/i.test(info.orderToken)) {
        info.orderStatus = '校验失败';
        toast('站点连接校验失败', 'error');
      } else {
        info.orderStatus = '连通正常';
        toast('站点连接测试成功', 'success');
      }
      renderSiteCards();
      updatePreview();
    }, 650);
  }

  function saveBatch() {
    if (!validateStep2()) return;
    var groupId = 'PG-' + Date.now().toString().slice(-6);
    var now = formatNow();
    var created = [];
    sites.forEach(function (s, index) {
      var info = draft.sites[s.key];
      if (!info.enabled) return;
      var store = {
        id: Date.now() + index,
        parentPrefix: draft.prefix,
        parentGroupId: groupId,
        name: buildStoreName(draft.prefix, s.key),
        siteKey: s.key,
        mode: draft.mode,
        company: draft.company,
        shopId: 'TEMU-' + s.short.toUpperCase().replace('区', '') + '-' + String(100000 + Math.floor(Math.random() * 899999)),
        officialName: draft.officialName,
        productToken: draft.productToken,
        productStatus: '校验通过',
        orderToken: info.orderToken,
        orderStatus: '正常拉取',
        warehouse: info.warehouse || s.defaultWarehouse,
        financeBoard: '已开通',
        updatedAt: now
      };
      created.push(store);
      stores.unshift(store);
    });
    closeBatchModal();
    renderTable();
    toast('已批量创建 ' + created.length + ' 个独立站点店铺：' + created.map(function (x) { return x.name; }).join('、'), 'success');
  }

  function openTokenModal(store) {
    editingStoreId = store.id;
    $('tokenModalSubtitle').textContent = store.name + ' · 商品 Token 共享，仅更新本站点订单 Token';
    $('inputOrderTokenEdit').value = store.orderToken || '';
    $('tokenModal').hidden = false;
  }

  function closeTokenModal() {
    $('tokenModal').hidden = true;
    editingStoreId = null;
  }

  function bind() {
    $('btnSearch').addEventListener('click', renderTable);
    $('btnReset').addEventListener('click', function () {
      $('filterKeyword').value = '';
      $('filterSite').value = '';
      $('filterOrderStatus').value = '';
      renderTable();
    });
    $('btnBatchAuth').addEventListener('click', openBatchModal);
    $('btnCloseModal').addEventListener('click', closeBatchModal);
    $('btnCancelModal').addEventListener('click', closeBatchModal);
    $('btnVerifyProduct').addEventListener('click', verifyProductToken);
    $('btnNextStep').addEventListener('click', function () {
      if (!validateStep1()) return;
      setStep(2);
    });
    $('btnPrevStep').addEventListener('click', function () { setStep(1); });
    $('btnSaveBatch').addEventListener('click', saveBatch);

    $('inputPrefix').addEventListener('input', function () {
      draft.prefix = this.value.trim();
      if (currentStep === 2) {
        renderSiteCards();
        updatePreview();
      }
    });

    $('siteCards').addEventListener('change', function (e) {
      var check = e.target.closest('[data-site-check]');
      var wh = e.target.closest('[data-site-warehouse]');
      if (check) {
        var key = check.getAttribute('data-site-check');
        draft.sites[key].enabled = check.checked;
        if (!check.checked) draft.sites[key].orderStatus = '未开通';
        else if (draft.sites[key].orderStatus === '未开通') draft.sites[key].orderStatus = '未测试';
        renderSiteCards();
        updatePreview();
      }
      if (wh) {
        draft.sites[wh.getAttribute('data-site-warehouse')].warehouse = wh.value;
      }
    });

    $('siteCards').addEventListener('input', function (e) {
      var input = e.target.closest('[data-site-token]');
      if (!input) return;
      var key = input.getAttribute('data-site-token');
      draft.sites[key].orderToken = input.value.trim();
      if (draft.sites[key].orderStatus === '连通正常') {
        draft.sites[key].orderStatus = '未测试';
        renderSiteCards();
        updatePreview();
      }
    });

    $('siteCards').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-site-test]');
      if (!btn) return;
      testSite(btn.getAttribute('data-site-test'));
    });

    $('storeTableBody').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var id = Number(btn.dataset.id);
      var store = stores.find(function (s) { return s.id === id; });
      if (!store) return;
      if (btn.dataset.act === 'update-token') openTokenModal(store);
      if (btn.dataset.act === 'bind-warehouse') {
        var next = prompt('为「' + store.name + '」绑定履约仓库', store.warehouse || '');
        if (next === null) return;
        next = next.trim();
        if (!next) {
          toast('仓库名称不能为空', 'error');
          return;
        }
        store.warehouse = next;
        store.updatedAt = formatNow();
        renderTable();
        toast('仓库绑定已更新：订单将从此仓库扣库存', 'success');
      }
    });

    $('btnCloseTokenModal').addEventListener('click', closeTokenModal);
    $('btnCancelTokenModal').addEventListener('click', closeTokenModal);
    $('btnTestOrderToken').addEventListener('click', function () {
      var token = ($('inputOrderTokenEdit').value || '').trim();
      if (!token) {
        toast('请填写订单 Token', 'error');
        return;
      }
      toast(/fail/i.test(token) ? '连接校验失败' : '连接测试成功', /fail/i.test(token) ? 'error' : 'success');
    });
    $('btnSaveOrderToken').addEventListener('click', function () {
      var store = stores.find(function (s) { return s.id === editingStoreId; });
      if (!store) return;
      var token = ($('inputOrderTokenEdit').value || '').trim();
      if (!token) {
        toast('请填写订单 Token', 'error');
        return;
      }
      store.orderToken = token;
      store.orderStatus = /fail|invalid/i.test(token) ? 'Token 异常' : '正常拉取';
      store.updatedAt = formatNow();
      closeTokenModal();
      renderTable();
      toast('订单 Token 已更新', 'success');
    });

    $('authModal').addEventListener('click', function (e) {
      if (e.target === $('authModal')) closeBatchModal();
    });
    $('tokenModal').addEventListener('click', function (e) {
      if (e.target === $('tokenModal')) closeTokenModal();
    });
  }

  bind();
  renderTable();
})();
