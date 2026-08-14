// export_inbox.js가 만든 메일 목록을 바탕으로, Claude가 결정한 정리 액션을 Mail.app에 적용하는 스크립트.
//
// 실행: osascript -l JavaScript scripts/mail/apply_actions.js <actions.json>
//
// actions.json 형식 (배열):
// [
//   { "messageId": "<rfc-message-id>", "action": "flag" },
//   { "messageId": "<rfc-message-id>", "action": "unflag" },
//   { "messageId": "<rfc-message-id>", "action": "markRead" },
//   { "messageId": "<rfc-message-id>", "action": "markUnread" },
//   { "messageId": "<rfc-message-id>", "action": "move", "mailbox": "Archive" },
//   { "messageId": "<rfc-message-id>", "action": "delete" }
// ]
//
// delete는 Mail.app의 기본 삭제 동작과 동일하게 해당 계정의 휴지통 메일함으로 이동시킨다
// (즉시 영구 삭제가 아니라 소프트 삭제).
//
// messageId는 export_inbox.js가 내보낸 각 메일의 "messageId" (RFC Message-ID 헤더) 값을 그대로 사용합니다.
// mailbox는 대상 메일함 이름(계정 내에서 검색)입니다. 하위 폴더까지 재귀적으로 검색합니다.
//
// 설계 노트: export_inbox.js와 마찬가지로 계정별 "INBOX" 메일함을 whose()로 직접 필터링해서 메시지를
// 찾는다. 수천 건을 하나씩 순회하며 messageId를 비교하는 방식은 계정이 여러 개, 메일이 많을 때
// 매우 느리고(수천 번의 AppleEvent 호출) Mail.app의 통합 inbox 순서도 신뢰할 수 없어 사용하지 않는다.

ObjC.import('Foundation');

function readFile(path) {
  const nsData = $.NSData.dataWithContentsOfFile(path);
  if (!nsData) throw new Error(`파일을 읽을 수 없습니다: ${path}`);
  const nsString = $.NSString.alloc.initWithDataEncoding(nsData, $.NSUTF8StringEncoding);
  return ObjC.unwrap(nsString);
}

function safeLength(spec) {
  try {
    return spec.length;
  } catch (e) {
    return 0;
  }
}

function run(argv) {
  const Mail = Application('Mail');
  Mail.includeStandardAdditions = true;

  const actionsPath = argv[0];
  if (!actionsPath) {
    return JSON.stringify({ error: 'usage: apply_actions.js <actions.json>' });
  }

  const actions = JSON.parse(readFile(actionsPath));
  const accounts = Mail.accounts();

  const accountInboxes = [];
  for (const acct of accounts) {
    try {
      const found = acct.mailboxes.whose({ name: 'INBOX' });
      if (found.length > 0) accountInboxes.push(found[0]);
    } catch (e) {
      continue;
    }
  }

  function findMessageByMessageId(messageId) {
    for (const inbox of accountInboxes) {
      try {
        const matched = inbox.messages.whose({ messageId: messageId });
        if (matched.length > 0) return matched[0];
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  function findMailboxRecursive(mailboxes, name) {
    try {
      const direct = mailboxes.whose({ name: name });
      if (direct.length > 0) return direct[0];
    } catch (e) {
      /* whose 실패 시 아래 수동 순회로 폴백 */
    }
    const count = safeLength(mailboxes);
    for (let i = 0; i < count; i++) {
      try {
        const mb = mailboxes[i];
        const nested = findMailboxRecursive(mb.mailboxes, name);
        if (nested) return nested;
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  function findMailboxByName(name) {
    for (const acct of accounts) {
      try {
        const found = findMailboxRecursive(acct.mailboxes, name);
        if (found) return found;
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  const results = [];

  for (const action of actions) {
    const msg = findMessageByMessageId(action.messageId);
    if (!msg) {
      results.push({ messageId: action.messageId, status: 'not_found' });
      continue;
    }
    try {
      if (action.action === 'flag') {
        msg.flaggedStatus = true;
      } else if (action.action === 'unflag') {
        msg.flaggedStatus = false;
      } else if (action.action === 'markRead') {
        msg.readStatus = true;
      } else if (action.action === 'markUnread') {
        msg.readStatus = false;
      } else if (action.action === 'move') {
        const dest = findMailboxByName(action.mailbox);
        if (!dest) {
          results.push({ messageId: action.messageId, status: 'mailbox_not_found', mailbox: action.mailbox });
          continue;
        }
        Mail.move(msg, { to: dest });
      } else if (action.action === 'delete') {
        Mail.delete(msg);
      } else {
        results.push({ messageId: action.messageId, status: 'unknown_action', action: action.action });
        continue;
      }
      results.push({ messageId: action.messageId, status: 'ok', action: action.action });
    } catch (e) {
      results.push({ messageId: action.messageId, status: 'error', error: String(e) });
    }
  }

  return JSON.stringify({ appliedAt: new Date().toISOString(), results: results });
}
