// /shared/blocks.js
(function () {
  const T = (window.Tennis = window.Tennis || {});
  const S = (T.Storage = T.Storage || {});
  const E = (T.Events  = T.Events  || {});
  const emit = (E.emitDom
    ? (type, detail) => E.emitDom(type, detail)
    : (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }))
  );

  const STORE = S.STORAGE || S.KEYS || {};
  const BLOCKS_KEY = STORE.BLOCKS || 'courtBlocks';

  // Idempotent namespace
  const NS = (T.BlocksService = T.BlocksService || {});

  if (typeof NS.saveBlocks === 'function') return;

  NS.saveBlocks = async function saveBlocks(blocks) {
    const arr = Array.isArray(blocks) ? blocks : [];

    // Persist via canonical path
    if (typeof S.writeJSON === 'function') {
      S.writeJSON(BLOCKS_KEY, arr);
    } else if (window.localStorage) {
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(arr));
    }

    // Emit modern & legacy signals so all listeners wake up
    emit('BLOCKS_UPDATED', { key: BLOCKS_KEY, blocks: arr });
    emit('tennisDataUpdate', { key: BLOCKS_KEY, data: arr });
    window.dispatchEvent(new Event('DATA_UPDATED'));

    return { success: true };
  };
})();