import path from 'node:path';

const mimeTypes = new Map([
  ['.pdf', 'application/pdf'],
  ['.txt', 'text/plain'],
  ['.csv', 'text/csv'],
  ['.zip', 'application/zip'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

export function mimeTypeFor(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}
