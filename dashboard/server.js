#!/usr/bin/env node
// 로컬 전용 통합 관리 대시보드. 인증/배포 없음 — 사용자 PC에서만 접속.
// "공장화" 확장: 새 계정을 추가하려면 dashboard/lib/accounts.js에 항목 하나만
// 추가하면 좌측 상단 드롭다운에 자동으로 나타난다. 새 스테이지/사이트 페이지를
// 추가하려면 dashboard/routes/*.js 파일 하나 + 아래 app.use() 한 줄 +
// lib/layout.js의 NAV 배열 한 줄만 있으면 된다.
require('dotenv').config();
const express = require('express');
const { listAccounts, getAccount } = require('./lib/accounts');

const app = express();
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.account = getAccount(req.query.account);
  req.accounts = listAccounts();
  next();
});

app.use(require('./routes/overview'));
app.use(require('./routes/planning'));
app.use(require('./routes/benchmark'));
app.use(require('./routes/factcheck'));
app.use(require('./routes/review'));
app.use(require('./routes/publish'));
app.use(require('./routes/verify'));
app.use(require('./routes/comments'));
app.use(require('./routes/performance'));

const PORT = process.env.DASHBOARD_PORT || 4848;
app.listen(PORT, () => {
  console.log(`대시보드 실행 중: http://localhost:${PORT}`);
});
