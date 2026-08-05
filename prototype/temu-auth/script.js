(function () {
  var stores = (window.TEMU_STORE_DATA || []).map(cloneStore);
  var regions = window.TEMU_REGIONS || [];
  var editingId = null;
  var currentStep = 1;
  var draft = emptyDraft();
  var openIds = new Set();

  function $(id) { return document.getElementById(id); }

  function cloneStore(store) {
    return JSON.parse(JSON.stringify(store));
  }

  function emptyDraft() {
    var regionState = {};
    regions.forEach(function (r) {
      regionState[r.key] = { enabled: false, token: '', status: '未开通' };
    });
    return {
      alias: '',
      mode: '',
      company: '云易盒科技有限公司',
      shopId: '',
      shopName: '',
      productToken: '',
      productStatus: '未校验',
      regions: regionState
    };
  }

  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (type ? ' ' + type : '');
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function maskToken(token) {
    if (!token) return '—';
    if (token.length <= 12) return token.slice(0, 4) + '****';
    return token.slice(0, 12) + '****';
  }

  function statusClass(status) {
    if (status === '连通正常' || status === '校验通过') return 'ok';
    if (status === '授权过期' || status === '未校验') return 'warn';
    if (status === '校验失败') return 'err';
    return 'off';
  }

  function filteredStores() {
    var keyword = ($('filterKeyword').value || '').trim().toLowerCase();
    var mode = $('filterMode').value;
    var product = $('filterProductToken').value;
    return stores.filter(function (s) {
      if (mode && s.mode !== mode) return false;
      if (product && s.productStatus !== product) return false;
      if (!keyword) return true;
      var text = [s.alias, s.shopName, s.shopId, s.company].join(' ').toLowerCase();
      return text.indexOf(keyword) >= 0;
    });
  }

  function renderList() {
    var list = filteredStores();
    $('totalCount').textContent = String(list.length);
    var root = $('storeList');
    if (!list.length) {
      root.innerHTML = '<div class="empty">暂无符合条件的店铺</div>';
      return;
    }
    root.innerHTML = list.map(function (s) {
      var tags = regions.map(function (r) {
        var info = s.regions[r.key] || { enabled: false, status: '未开通' };
        var cls = info.enabled ? statusClass(info.status) : 'off';
        var label = info.enabled ? r.short : r.short + '未开通';
        return '<span class="region-tag ' + cls + '"><span class="dot ' + cls + '"></span>' + label + '</span>';
      }).join('');

      var detailRows = regions.map(function (r) {
        var info = s.regions[r.key] || { enabled: false, token: '', status: '未开通' };
        var statusHtml = info.enabled
          ? '<span class="status-tag ' + statusClass(info.status) + '">' + info.status + '</span>'
          : '<span class="status-tag">未开通</span>';
        var action = info.enabled
          ? '<button class="btn sm" type="button" data-act="update-region" data-id="' + s.id + '" data-region="' + r.key + '">更新 Token</button>'
          : '—';
        return '<tr>' +
          '<td>' + r.name + '</td>' +
          '<td><code class="token-mask">' + (info.enabled ? maskToken(info.token) : '—') + '</code></td>' +
          '<td>' + statusHtml + '</td>' +
          '<td>' + action + '</td>' +
          '</tr>';
      }).join('');

      var open = openIds.has(s.id);
      return '<article class="store-card' + (open ? ' is-open' : '') + '" data-id="' + s.id + '">' +
        '<div class="store-card-main">' +
          '<div>' +
            '<div class="col-title">物理店铺</div>' +
            '<div class="store-name">' + escapeHtml(s.alias) + '</div>' +
            '<div class="meta-line">官方店铺 ID：<strong>' + escapeHtml(s.shopId || '—') + '</strong></div>' +
            '<div class="meta-line">官方店铺名称：<strong>' + escapeHtml(s.shopName || '—') + '</strong></div>' +
            '<div class="meta-line">关联公司：' + escapeHtml(s.company) + '</div>' +
            '<span class="mode-tag">' + escapeHtml(s.mode) + '</span>' +
          '</div>' +
          '<div>' +
            '<div class="col-title">商品 / 库存 Token</div>' +
            '<div class="product-status">' +
              '<span class="dot ' + statusClass(s.productStatus) + '"></span>' +
              '<span>' + escapeHtml(s.productStatus) + '</span>' +
            '</div>' +
            '<div style="margin-top:8px"><code class="token-mask">' + maskToken(s.productToken) + '</code></div>' +
          '</div>' +
          '<div>' +
            '<div class="col-title">站点与订单 Token</div>' +
            '<div class="region-tags">' + tags + '</div>' +
            '<div class="meta-line">更新时间：' + escapeHtml(s.updatedAt || '—') + '</div>' +
          '</div>' +
          '<div class="store-actions">' +
            '<button class="btn sm" type="button" data-act="toggle" data-id="' + s.id + '">' + (open ? '收起明细' : '展开明细') + '</button>' +
            '<button class="btn sm primary" type="button" data-act="edit" data-id="' + s.id + '">编辑授权</button>' +
          '</div>' +
        '</div>' +
        '<div class="expand-panel">' +
          '<table class="region-detail-table">' +
            '<thead><tr><th>区域站点</th><th>订单 Token</th><th>联通状态</th><th>操作</th></tr></thead>' +
            '<tbody>' + detailRows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setStep(step) {
    currentStep = step;
    $('step1').hidden = step !== 1;
    $('step2').hidden = step !== 2;
    $('btnPrevStep').hidden = step === 1;
    $('btnNextStep').hidden = step !== 1;
    $('btnSaveAuth').hidden = step !== 2;
    document.querySelectorAll('.step-item').forEach(function (el) {
      var n = Number(el.dataset.step);
      el.classList.toggle('active', n === step);
      el.classList.toggle('done', n < step);
    });
  }

  function openModal(store) {
    editingId = store ? store.id : null;
    draft = store ? cloneStore(store) : emptyDraft();
    $('modalTitle').textContent = store ? '编辑 Temu 店铺授权' : '新增 Temu 店铺授权';
    $('inputAlias').value = draft.alias || '';
    $('inputMode').value = draft.mode || '';
    $('inputCompany').value = draft.company || '云易盒科技有限公司';
    $('inputProductToken').value = draft.productToken || '';
    syncProductMeta();
    renderRegionCards();
    setStep(1);
    $('authModal').hidden = false;
  }

  function closeModal() {
    $('authModal').hidden = true;
    editingId = null;
    draft = emptyDraft();
  }

  function syncProductMeta() {
    var ok = draft.productStatus === '校验通过' && draft.shopId;
    $('productFetchMeta').hidden = !ok;
    $('fetchedShopId').textContent = draft.shopId || '—';
    $('fetchedShopName').textContent = draft.shopName || '—';
    var statusEl = $('productVerifyStatus');
    statusEl.textContent = draft.productStatus === '校验通过' ? '✓ 校验通过' : draft.productStatus;
    statusEl.className = 'status-tag ' + statusClass(draft.productStatus);
  }

  function renderRegionCards() {
    $('regionCards').innerHTML = regions.map(function (r) {
      var info = draft.regions[r.key] || { enabled: false, token: '', status: '未开通' };
      var enabled = !!info.enabled;
      var status = enabled ? (info.status || '未测试') : '未开通';
      var statusCls = enabled ? statusClass(status === '未测试' ? '未校验' : status) : 'off';
      var statusText = !enabled ? '未开通' : (status === '连通正常' ? '✓ 连通正常' : (status === '校验失败' ? '✕ 校验失败' : (status === '授权过期' ? '⚠ 授权过期' : status)));
      return '<div class="region-card' + (enabled ? ' enabled' : '') + '" data-region="' + r.key + '">' +
        '<div class="region-status"><span class="status-tag ' + statusCls + '">' + statusText + '</span></div>' +
        '<div class="region-card-head">' +
          '<label class="region-check">' +
            '<input type="checkbox" data-region-check="' + r.key + '"' + (enabled ? ' checked' : '') + ' />' +
            '<span><div class="region-title">' + r.name + '</div><div class="region-host">' + r.host + '</div></span>' +
          '</label>' +
        '</div>' +
        '<div class="region-body">' +
          '<input class="form-input" data-region-token="' + r.key + '" placeholder="粘贴该区域专属订单 Token" maxlength="128" ' +
            (enabled ? '' : 'disabled ') + 'value="' + escapeHtml(info.token || '') + '" />' +
          '<button class="btn" type="button" data-region-test="' + r.key + '"' + (enabled ? '' : ' disabled') + '>测试连接</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function readStep1IntoDraft() {
    draft.alias = ($('inputAlias').value || '').trim();
    draft.mode = $('inputMode').value;
    draft.company = $('inputCompany').value;
    draft.productToken = ($('inputProductToken').value || '').trim();
  }

  function validateStep1() {
    readStep1IntoDraft();
    if (!draft.alias || draft.alias.length < 2) {
      toast('请填写自定义店铺名称（至少 2 个字符）', 'error');
      return false;
    }
    if (!draft.mode) {
      toast('请选择托管业务类型', 'error');
      return false;
    }
    if (!draft.productToken) {
      toast('请填写商品 / 库存 Token', 'error');
      return false;
    }
    if (draft.productStatus !== '校验通过' || !draft.shopId) {
      toast('请先校验商品 Token', 'error');
      return false;
    }
    return true;
  }

  function validateStep2() {
    var enabledCount = 0;
    for (var i = 0; i < regions.length; i++) {
      var key = regions[i].key;
      var info = draft.regions[key];
      if (!info.enabled) continue;
      enabledCount += 1;
      if (!info.token) {
        toast('请填写「' + regions[i].short + '」订单 Token', 'error');
        return false;
      }
      if (info.status !== '连通正常') {
        toast('请先测试「' + regions[i].short + '」连接，并确保连通正常', 'error');
        return false;
      }
    }
    if (!enabledCount) {
      toast('请至少勾选一个已开通区域', 'error');
      return false;
    }
    return true;
  }

  function verifyProductToken() {
    readStep1IntoDraft();
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
        draft.shopId = '';
        draft.shopName = '';
        syncProductMeta();
        toast('Token 校验失败，请检查后重试', 'error');
        return;
      }
      draft.productStatus = '校验通过';
      draft.shopId = draft.shopId || ('TEMU-' + String(100000 + Math.floor(Math.random() * 899999)));
      draft.shopName = draft.shopName || (draft.alias ? draft.alias.replace(/-\d+$/, '') + ' Official' : 'Temu Official Shop');
      syncProductMeta();
      toast('商品 Token 校验通过，已回填店铺信息', 'success');
    }, 700);
  }

  function testRegion(key) {
    var info = draft.regions[key];
    if (!info || !info.enabled) return;
    var tokenInput = document.querySelector('[data-region-token="' + key + '"]');
    info.token = tokenInput ? tokenInput.value.trim() : info.token;
    if (!info.token) {
      toast('请先粘贴该区域订单 Token', 'error');
      return;
    }
    var btn = document.querySelector('[data-region-test="' + key + '"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '测试中…';
    }
    setTimeout(function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '测试连接';
      }
      if (/fail|过期|invalid/i.test(info.token)) {
        info.status = '校验失败';
        toast('区域连接校验失败', 'error');
      } else if (/expire|expired/i.test(info.token)) {
        info.status = '授权过期';
        toast('该区域 Token 已过期', 'error');
      } else {
        info.status = '连通正常';
        toast('区域连接测试成功', 'success');
      }
      renderRegionCards();
    }, 650);
  }

  function saveAuth() {
    if (!validateStep2()) return;
    var now = formatNow();
    if (editingId) {
      var idx = stores.findIndex(function (s) { return s.id === editingId; });
      if (idx >= 0) {
        stores[idx] = Object.assign({}, draft, { id: editingId, updatedAt: now });
      }
      toast('授权配置已更新', 'success');
    } else {
      var id = Date.now();
      stores.unshift(Object.assign({}, draft, { id: id, updatedAt: now }));
      toast('授权配置已保存，已启动对应区域订单拉取任务', 'success');
    }
    closeModal();
    renderList();
  }

  function formatNow() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function bind() {
    $('btnSearch').addEventListener('click', renderList);
    $('btnReset').addEventListener('click', function () {
      $('filterKeyword').value = '';
      $('filterMode').value = '';
      $('filterProductToken').value = '';
      renderList();
    });
    $('btnAddStore').addEventListener('click', function () { openModal(null); });
    $('btnCloseModal').addEventListener('click', closeModal);
    $('btnCancelModal').addEventListener('click', closeModal);
    $('btnVerifyProduct').addEventListener('click', verifyProductToken);
    $('btnNextStep').addEventListener('click', function () {
      if (!validateStep1()) return;
      setStep(2);
    });
    $('btnPrevStep').addEventListener('click', function () { setStep(1); });
    $('btnSaveAuth').addEventListener('click', saveAuth);

    $('regionCards').addEventListener('change', function (e) {
      var check = e.target.closest('[data-region-check]');
      if (!check) return;
      var key = check.getAttribute('data-region-check');
      draft.regions[key].enabled = check.checked;
      if (!check.checked) {
        draft.regions[key].status = '未开通';
      } else if (!draft.regions[key].token) {
        draft.regions[key].status = '未测试';
      }
      renderRegionCards();
    });

    $('regionCards').addEventListener('input', function (e) {
      var input = e.target.closest('[data-region-token]');
      if (!input) return;
      var key = input.getAttribute('data-region-token');
      draft.regions[key].token = input.value.trim();
      if (draft.regions[key].enabled && draft.regions[key].status === '连通正常') {
        draft.regions[key].status = '未测试';
        renderRegionCards();
      }
    });

    $('regionCards').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-region-test]');
      if (!btn) return;
      testRegion(btn.getAttribute('data-region-test'));
    });

    $('storeList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var id = Number(btn.dataset.id);
      var store = stores.find(function (s) { return s.id === id; });
      if (!store) return;
      var act = btn.dataset.act;
      if (act === 'toggle') {
        if (openIds.has(id)) openIds.delete(id);
        else openIds.add(id);
        renderList();
      } else if (act === 'edit') {
        openModal(store);
      } else if (act === 'update-region') {
        openModal(store);
        setTimeout(function () {
          if (validateStep1()) setStep(2);
          else setStep(1);
        }, 0);
      }
    });

    $('authModal').addEventListener('click', function (e) {
      if (e.target === $('authModal')) closeModal();
    });
  }

  bind();
  renderList();
})();
