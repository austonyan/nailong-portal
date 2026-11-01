// 前端 CSV 导出(纯客户端,不经过服务端)。
// 实现由 immigration / dip / archives 三份逐字相同的副本合并而来:
// UTF-8 BOM + CRLF,Excel 打开中文表头不乱码。

/**
 * 触发浏览器下载一个已经生成好的 data/blob URL;文件名原样交给 `<a download>`。
 * @param {string} url data: 或 blob: URL
 * @param {string} filename 建议的下载文件名
 * @returns {void}
 */
export function downloadDataUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 把行数据导出为 CSV 文件并立即下载。
 * @param {string} filename 下载文件名(通常以 `.csv` 结尾)
 * @param {{key: string, label: string}[]} columns 列定义:label 为表头,key 取行对象字段
 * @param {Record<string, unknown>[]} rows 行数据
 * @returns {void}
 */
export function exportCsv(filename, columns, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}