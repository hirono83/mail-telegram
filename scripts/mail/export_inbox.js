// macOS Mail.app 받은편지함을 JSON으로 내보내는 JXA(JavaScript for Automation) 스크립트.
//
// 실행: osascript -l JavaScript scripts/mail/export_inbox.js
//
// 사전 준비:
//   - Mail.app이 실행 중이고 로그인되어 있어야 합니다.
//   - 최초 실행 시 macOS가 "터미널이 Mail을 제어하려고 합니다" 권한 팝업을 띄웁니다. 허용하세요.
//     (시스템 설정 > 개인정보 보호 및 보안 > 자동화 에서 나중에 재확인/변경 가능)
//
// 주의: Mail.app의 JXA 스크립팅 딕셔너리는 macOS 버전에 따라 속성명이 조금씩 다를 수 있습니다.
// 이 스크립트는 Sonoma/Sequoia 기준으로 작성되었으며, 실제 환경에서 한 번 수동 실행해
// 출력이 기대한 형태인지 확인 후 사용하세요 (README 참고).

ObjC.import('Foundation');

function getEnv(name, fallback) {
  const val = $.NSProcessInfo.processInfo.environment.objectForKey(name);
  if (!val || (val.isNil && val.isNil())) return fallback;
  const str = ObjC.unwrap(val);
  return str === undefined || str === null || str === '' ? fallback : str;
}

function safeGet(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback ?? null : v;
  } catch (e) {
    return fallback ?? null;
  }
}

function run() {
  const Mail = Application('Mail');
  Mail.includeStandardAdditions = true;

  const maxMessages = Number(getEnv('MAIL_MAX_MESSAGES', '150'));
  const lookbackDays = Number(getEnv('MAIL_LOOKBACK_DAYS', '2'));
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const inboxMessages = Mail.inbox.messages;
  const total = safeGet(() => inboxMessages.length, 0);
  const scanCap = Math.min(total, maxMessages * 5); // 날짜 필터링 여유분

  const results = [];
  for (let i = 0; i < scanCap; i++) {
    const msg = inboxMessages[i];

    const dateReceivedRaw = safeGet(() => msg.dateReceived());
    if (!dateReceivedRaw) continue;
    const dateReceived = new Date(dateReceivedRaw);
    // 받은편지함은 최신순으로 정렬되어 있다고 가정. cutoff보다 오래된 메일이 나오면 중단.
    if (dateReceived < cutoff) break;

    results.push({
      id: safeGet(() => msg.id()),
      messageId: safeGet(() => msg.messageId()),
      subject: safeGet(() => msg.subject()),
      sender: safeGet(() => msg.sender()),
      dateReceived: dateReceived.toISOString(),
      mailbox: safeGet(() => msg.mailbox().name()),
      account: safeGet(() => msg.mailbox().account().name()),
      flagged: safeGet(() => msg.flaggedStatus(), false),
      read: safeGet(() => msg.readStatus(), false),
      preview: safeGet(() => String(msg.content()).slice(0, 500), ''),
    });

    if (results.length >= maxMessages) break;
  }

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: results.length,
      messages: results,
    },
    null,
    0
  );
}
