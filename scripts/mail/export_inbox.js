// macOS Mail.app 받은편지함을 JSON으로 내보내는 JXA(JavaScript for Automation) 스크립트.
//
// 실행: osascript -l JavaScript scripts/mail/export_inbox.js
//
// 사전 준비:
//   - Mail.app이 실행 중이고 로그인되어 있어야 합니다.
//   - 최초 실행 시 macOS가 "터미널이 Mail을 제어하려고 합니다" 권한 팝업을 띄웁니다. 허용하세요.
//     (시스템 설정 > 개인정보 보호 및 보안 > 자동화 에서 나중에 재확인/변경 가능)
//
// 설계 노트: Mail.app의 특수 "inbox" 속성(통합 받은편지함)은 여러 계정을 하나로 이어붙이긴 하지만
// 계정 경계를 넘어 날짜순으로 정렬해주지는 않는다 (실측 확인됨). 그래서 각 계정을 순회하며
// 계정별 "INBOX" 메일함에서 whose()로 날짜 필터링을 해 가져온 뒤, 스크립트에서 직접 날짜순 정렬한다.

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

  const results = [];
  const accounts = Mail.accounts();

  for (const acct of accounts) {
    const acctName = safeGet(() => acct.name(), null);

    let inboxMailbox = null;
    try {
      const found = acct.mailboxes.whose({ name: 'INBOX' });
      if (found.length > 0) inboxMailbox = found[0];
    } catch (e) {
      inboxMailbox = null;
    }
    if (!inboxMailbox) continue; // 이 계정엔 INBOX라는 이름의 메일함이 없음 (구조가 다를 수 있음)

    let recentMessages;
    let count;
    try {
      recentMessages = inboxMailbox.messages.whose({ dateReceived: { _greaterThan: cutoff } });
      count = safeGet(() => recentMessages.length, 0);
    } catch (e) {
      continue; // 이 계정 필터링 실패 시 건너뛰고 다른 계정은 계속 처리
    }

    for (let i = 0; i < count; i++) {
      const msg = recentMessages[i];
      const dateReceivedRaw = safeGet(() => msg.dateReceived());
      if (!dateReceivedRaw) continue;

      results.push({
        id: safeGet(() => msg.id()),
        messageId: safeGet(() => msg.messageId()),
        subject: safeGet(() => msg.subject()),
        sender: safeGet(() => msg.sender()),
        dateReceived: new Date(dateReceivedRaw).toISOString(),
        mailbox: 'INBOX',
        account: acctName,
        flagged: safeGet(() => msg.flaggedStatus(), false),
        read: safeGet(() => msg.readStatus(), false),
        preview: safeGet(() => String(msg.content()).slice(0, 500), ''),
      });
    }
  }

  // 계정별로 모은 뒤 전체를 다시 최신순 정렬 + 상한 적용
  results.sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));
  const capped = results.slice(0, maxMessages);

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: capped.length,
      messages: capped,
    },
    null,
    0
  );
}
